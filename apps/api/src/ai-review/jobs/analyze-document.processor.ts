import type { AiContentBlock } from '../ai.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../db/db.module.js';
import {
  aiIssues,
  aiReviews,
  documents,
  type NewAiIssue,
} from '../../db/schema/index.js';
import {
  LAW_SEARCH,
  type LawArticleHit,
  type LawSearchService,
} from '../../law-search/law-search.types.js';
import {
  AI_WORKER_OPTIONS,
  QUEUE,
  type AnalyzeDocumentJob,
} from '../../queue/queue.constants.js';
import { AiUsageService } from '../../usage/ai-usage.service.js';
import { AiError, toAiError } from '../ai-errors.js';
import { addUsage, AiService, emptyUsage } from '../ai.service.js';
import { checkCitations } from '../citations.js';
import { clauseOutline, resolveClause } from '../clauses.js';
import { DocumentContentService } from '../document-content.service.js';
import {
  articlesBlockText,
  clausesBlockText,
  CLASSIFY_SYSTEM,
  languageInstruction,
  reviewSystem,
} from '../prompts.js';
import { classifyOutputSchema, reviewOutputSchema } from '../schemas.js';

/**
 * extract → classify → retrieve → review → citation check → save.
 *
 * Idempotent: the job carries only a review id, a review that is already
 * `done` returns immediately, and the issues of a retried attempt replace the
 * previous attempt's rows inside one transaction.
 */
@Processor(QUEUE.analyzeDocument, AI_WORKER_OPTIONS)
export class AnalyzeDocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyzeDocumentProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LAW_SEARCH) private readonly lawSearch: LawSearchService,
    private readonly ai: AiService,
    private readonly content: DocumentContentService,
    private readonly usage: AiUsageService,
  ) {
    super();
  }

  async process(job: Job<AnalyzeDocumentJob>): Promise<void> {
    const { reviewId } = job.data;

    const [review] = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.id, reviewId))
      .limit(1);
    if (!review) {
      this.logger.warn(`review ${reviewId} is gone; nothing to do`);
      return;
    }
    if (review.status === 'done') return;

    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, review.documentId))
      .limit(1);
    if (!document) {
      await this.fail(reviewId, 'The document no longer exists');
      return;
    }

    await this.db
      .update(aiReviews)
      .set({ status: 'running', startedAt: new Date(), error: null })
      .where(eq(aiReviews.id, reviewId));

    try {
      const loaded = await this.content.load(document);
      const documentBlocks = this.content.asContentBlocks(document, loaded);

      // Call 1: what is this, who are the parties, what law should we fetch.
      const classify = await this.ai.structured({
        label: 'classify',
        system: CLASSIFY_SYSTEM,
        content: documentBlocks,
        schema: classifyOutputSchema,
        // Triage, not judgement: the cheap model at middling effort. It reads
        // the whole document, so this is where the money is.
        tier: 'light',
        effort: 'medium',
        maxTokens: 8_000,
      });

      const hits = await this.retrieve(
        classify.output.searchQueries,
        classify.output.docType,
      );

      // Call 2: the review. Document last, after the cached system prompt and
      // the retrieved articles, so the cacheable prefix stays stable.
      const outline = clausesBlockText(clauseOutline(loaded.clauses));
      const reviewContent: AiContentBlock[] = [
        { type: 'text', text: languageInstruction(review.language) },
        { type: 'text', text: articlesBlockText(hits) },
        ...(outline ? [{ type: 'text' as const, text: outline }] : []),
        ...documentBlocks,
      ];
      const reviewed = await this.ai.structured({
        label: 'review',
        system: reviewSystem(classify.output.docType),
        content: reviewContent,
        schema: reviewOutputSchema,
      });

      // The server decides what may be cited.
      const check = await checkCitations(
        this.lawSearch,
        hits,
        reviewed.output.issues.map((issue) => issue.articleId),
      );
      for (const [articleId, kind] of check.failures) {
        this.logger.warn(
          `review ${reviewId}: dropped citation ${articleId} (${kind} failure)`,
        );
      }

      const lawVersionDate = await this.lawSearch
        .indexVersionDate()
        .catch(() => null);

      // The document's numbering wins: a ref the document does not have is
      // kept as the model wrote it, but without offsets, so the frontend can
      // tell the two apart.
      const issueRows: NewAiIssue[] = reviewed.output.issues.map(
        (issue, index) => {
          const clause = resolveClause(
            loaded.clauses,
            issue.clauseRef,
            issue.quote,
          );
          return {
            reviewId,
            clauseRef: clause.ref,
            clauseStart: clause.start,
            clauseEnd: clause.end,
            quote: issue.quote,
            problem: issue.problem,
            severity: issue.severity,
            recommendation: issue.recommendation,
            citation: issue.articleId
              ? (check.snapshots.get(issue.articleId) ?? null)
              : null,
            orderIndex: index,
          };
        },
      );

      const unresolved = issueRows.filter((r) => r.clauseStart === null).length;
      if (unresolved > 0 && loaded.clauses.length > 0) {
        this.logger.warn(
          `review ${reviewId}: ${unresolved}/${issueRows.length} issues ` +
            `name a clause the document does not have`,
        );
      }

      const totals = addUsage(
        addUsage(emptyUsage(), classify.usage),
        reviewed.usage,
      );

      await this.db.transaction(async (tx) => {
        // A retry replaces the previous attempt's issues rather than adding to
        // them, so the saved review is always one consistent answer.
        await tx.delete(aiIssues).where(eq(aiIssues.reviewId, reviewId));
        if (issueRows.length > 0) await tx.insert(aiIssues).values(issueRows);

        await tx
          .update(aiReviews)
          .set({
            status: 'done',
            docType: classify.output.docType,
            parties: classify.output.parties.map((p) => ({
              name: p.name,
              role: p.role,
            })),
            riskLevel: reviewed.output.riskLevel,
            verdict: reviewed.output.verdict,
            summary: reviewed.output.summary,
            lawVersionDate,
            model: reviewed.model,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheReadTokens: totals.cacheReadTokens,
            costUsd: totals.costUsd.toFixed(6),
            finishedAt: new Date(),
            error: null,
          })
          .where(eq(aiReviews.id, reviewId));
      });

      await this.usage.recordReview(
        { userId: review.requestedByUserId, agencyId: review.agencyId },
        totals,
      );

      this.logger.log(
        `review ${reviewId} done: ${reviewed.output.riskLevel} risk, ` +
          `${issueRows.length} issues, ${hits.length} articles retrieved`,
      );
    } catch (error) {
      const aiError = toAiError(error);
      const attempt = (job.attemptsMade ?? 0) + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      if (aiError.retryable && attempt < maxAttempts) {
        // Leave the review `running` and let BullMQ back off and retry.
        await this.db
          .update(aiReviews)
          .set({ status: 'queued' })
          .where(eq(aiReviews.id, reviewId));
        throw aiError;
      }

      await this.fail(reviewId, this.userMessage(aiError, error));
    }
  }

  private async retrieve(
    queries: string[],
    docType: 'rental' | 'employment' | 'sale' | 'services' | 'nda' | 'other',
  ): Promise<LawArticleHit[]> {
    try {
      return await this.lawSearch.search({ queries, docType, limit: 30 });
    } catch (error) {
      // A law-service outage must not lose the review: it continues with no
      // articles, every finding gets `citation: null`, and the prompt tells
      // the model to say that no supporting norm was found.
      this.logger.error(
        `law search failed, continuing without articles: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return [];
    }
  }

  /** Safe for storage and for the client: never raw model or provider text. */
  private userMessage(aiError: AiError, original: unknown): string {
    if (original instanceof AiError) return aiError.message;
    if (original instanceof Error) {
      // The extractor's own reason is written for a user and carries no
      // document text ("The PDF file could not be read; it may be damaged or
      // password-protected"), and it is far more useful than "unexpected AI
      // failure". Matched by name rather than by import: the class lives in
      // the law track's module, behind the DOC_PROCESSING interface.
      if (original.name === 'DocumentExtractionError') return original.message;
      // The stand-in extractor, for file types it cannot read yet.
      if (original.message.startsWith('Document extraction')) {
        return original.message;
      }
    }
    return aiError.message;
  }

  private async fail(reviewId: string, message: string): Promise<void> {
    await this.db
      .update(aiReviews)
      .set({ status: 'failed', error: message, finishedAt: new Date() })
      .where(eq(aiReviews.id, reviewId));
    this.logger.warn(`review ${reviewId} failed: ${message}`);
  }
}
