import type { AiContentBlock } from '../ai.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import { hashJson } from '../../common/hash.js';
import { DB, type Db } from '../../db/db.module.js';
import {
  aiIssues,
  aiReviews,
  documents,
  recipientSummaries,
  signatureRequests,
  users,
  type NewRecipientSummary,
  type SignatureRequest,
  type SummaryBody,
} from '../../db/schema/index.js';
import {
  QUEUE,
  type SummarizeForRecipientsJob,
} from '../../queue/queue.constants.js';
import { AiUsageService } from '../../usage/ai-usage.service.js';
import { toAiError } from '../ai-errors.js';
import { AiService } from '../ai.service.js';
import { DocumentContentService } from '../document-content.service.js';
import {
  languageInstruction,
  reviewFindingsBlockText,
  SUMMARY_SYSTEM,
} from '../prompts.js';
import { summaryOutputSchema } from '../schemas.js';

/** At most this many review findings go into the summary call. */
const MAX_FINDINGS = 30;

/** The party name when nobody said which party the people are. */
const GENERIC_PARTY = 'imzolovçi';

/**
 * One summary per send, written at send time: everyone signing a send is the
 * same party, so one model call and one row.
 *
 * This is what makes the signing page possible without AI on the request path:
 * `GET /sign/:token/summary` only reads the row this job wrote.
 */
@Processor(QUEUE.summarizeForRecipients)
export class SummarizeForRecipientsProcessor extends WorkerHost {
  private readonly logger = new Logger(SummarizeForRecipientsProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
    private readonly content: DocumentContentService,
    private readonly usage: AiUsageService,
  ) {
    super();
  }

  async process(job: Job<SummarizeForRecipientsJob>): Promise<void> {
    const { signatureRequestId, language } = job.data;

    const [request] = await this.db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, signatureRequestId))
      .limit(1);
    if (!request) return;
    if (request.summariesStatus === 'done') return;

    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, request.documentId))
      .limit(1);
    if (!document) {
      await this.fail(signatureRequestId);
      return;
    }

    const partyName = await this.partyFor(request);

    await this.db
      .update(signatureRequests)
      .set({ summariesStatus: 'running' })
      .where(eq(signatureRequests.id, signatureRequestId));

    try {
      const loaded = await this.content.load(document);
      const documentBlocks = this.content.asContentBlocks(document, loaded);
      const findings = reviewFindingsBlockText(
        await this.reviewFindings(document.id),
      );

      const content: AiContentBlock[] = [
        { type: 'text', text: languageInstruction(language) },
        {
          type: 'text',
          text: `You are writing for this party of the contract: "${partyName}". Everything that party must do goes in yourObligations; everything the other side must do goes in otherObligations.`,
        },
        ...documentBlocks,
        ...(findings ? [{ type: 'text' as const, text: findings }] : []),
      ];

      const result = await this.ai.structured({
        label: 'summarize',
        system: SUMMARY_SYSTEM,
        content,
        schema: summaryOutputSchema,
        // A summary is explanation, not analysis: it holds up a level down.
        // Plain language from a document already read, so the cheap model.
        tier: 'light',
        effort: 'medium',
        maxTokens: 16_000,
      });

      const body: SummaryBody = {
        overview: result.output.overview,
        yourObligations: result.output.yourObligations.map(toObligation),
        otherObligations: result.output.otherObligations.map(toObligation),
        keyConditions: result.output.keyConditions.map((c) => ({
          label: c.label,
          value: c.value,
        })),
        youGet: result.output.youGet.map(toPoint),
        youGive: result.output.youGive.map(toPoint),
        deadlines: result.output.deadlines.map((d) => ({
          when: d.when,
          what: d.what,
          who: d.who,
          clauseRef: d.clauseRef,
        })),
        watchOut: result.output.watchOut.map((w) => ({
          text: w.text,
          severity: w.severity,
          clauseRef: w.clauseRef,
        })),
        howToEnd: result.output.howToEnd.map(toPoint),
      };
      // The certificate of every copy records this hash, so it is provable
      // which text each signer was shown.
      const summaryHash = hashJson(body);
      const row: NewRecipientSummary = {
        signatureRequestId,
        recipientId: null,
        partyName,
        language,
        body,
        summaryHash,
      };

      await this.db.transaction(async (tx) => {
        await tx.insert(recipientSummaries).values(row).onConflictDoUpdate({
          target: recipientSummaries.signatureRequestId,
          set: { partyName, language, body, summaryHash },
        });
        await tx
          .update(signatureRequests)
          .set({ summariesStatus: 'done', summaryHash })
          .where(eq(signatureRequests.id, signatureRequestId));
      });

      await this.usage.recordSummaries(
        { userId: request.createdByUserId, agencyId: request.agencyId },
        result.usage,
        1,
      );

      this.logger.log(
        `summary for ${signatureRequestId} (${partyName}): hash ${summaryHash.slice(0, 12)}…`,
      );
    } catch (error) {
      const aiError = toAiError(error);
      const attempt = (job.attemptsMade ?? 0) + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      if (aiError.retryable && attempt < maxAttempts) {
        await this.db
          .update(signatureRequests)
          .set({ summariesStatus: 'queued' })
          .where(eq(signatureRequests.id, signatureRequestId));
        throw aiError;
      }

      this.logger.warn(
        `summaries for ${signatureRequestId} failed: ${aiError.code}`,
      );
      await this.fail(signatureRequestId);
    }
  }

  /**
   * Who the people signing are: the sender's choice; else, when the AI review
   * found exactly two parties and one is the sender, the other one; else a
   * generic signer.
   */
  private async partyFor(request: SignatureRequest): Promise<string> {
    if (request.partyName?.trim()) return request.partyName.trim();

    const [review] = await this.db
      .select({ parties: aiReviews.parties })
      .from(aiReviews)
      .where(
        and(
          eq(aiReviews.documentId, request.documentId),
          eq(aiReviews.status, 'done'),
        ),
      )
      .orderBy(desc(aiReviews.createdAt))
      .limit(1);
    const [sender] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, request.createdByUserId))
      .limit(1);

    const parties = review?.parties ?? [];
    const me = sender?.fullName.trim().toLowerCase();
    const isMe = (p: { name: string }) => p.name.trim().toLowerCase() === me;
    if (parties.length === 2 && parties.some(isMe)) {
      const other = parties.find((p) => !isMe(p));
      if (other) return other.name;
    }
    return GENERIC_PARTY;
  }

  /**
   * The findings of the document's newest finished review, most severe first.
   * Hints for "watchOut"; none when the document was never reviewed.
   */
  private async reviewFindings(documentId: string) {
    const [review] = await this.db
      .select({ id: aiReviews.id })
      .from(aiReviews)
      .where(
        and(eq(aiReviews.documentId, documentId), eq(aiReviews.status, 'done')),
      )
      .orderBy(desc(aiReviews.createdAt))
      .limit(1);
    if (!review) return [];

    const rows = await this.db
      .select({
        severity: aiIssues.severity,
        clauseRef: aiIssues.clauseRef,
        problem: aiIssues.problem,
        quote: aiIssues.quote,
      })
      .from(aiIssues)
      .where(eq(aiIssues.reviewId, review.id))
      .orderBy(aiIssues.orderIndex);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return rows
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, MAX_FINDINGS);
  }

  /**
   * A failed summary does not block signing: the invite goes out and the
   * signing page shows the contract without the plain-language summary.
   */
  private async fail(signatureRequestId: string): Promise<void> {
    await this.db
      .update(signatureRequests)
      .set({ summariesStatus: 'failed' })
      .where(eq(signatureRequests.id, signatureRequestId));
  }
}

function toPoint(p: { text: string; clauseRef: string }) {
  return { text: p.text, clauseRef: p.clauseRef };
}

function toObligation(o: {
  text: string;
  deadline: string | null;
  penalty: string | null;
  clauseRef: string;
}) {
  return {
    text: o.text,
    ...(o.deadline ? { deadline: o.deadline } : {}),
    ...(o.penalty ? { penalty: o.penalty } : {}),
    clauseRef: o.clauseRef,
  };
}
