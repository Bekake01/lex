import type { AiContentBlock } from '../ai.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { asc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../db/db.module.js';
import {
  aiEdits,
  aiReviewMessages,
  aiReviews,
  documents,
  type NewAiEdit,
} from '../../db/schema/index.js';
import {
  LAW_SEARCH,
  type LawArticleHit,
  type LawSearchService,
} from '../../law-search/law-search.types.js';
import { QUEUE, type ReviseDocumentJob } from '../../queue/queue.constants.js';
import { AiUsageService } from '../../usage/ai-usage.service.js';
import { toAiError } from '../ai-errors.js';
import { AiService } from '../ai.service.js';
import { checkCitations } from '../citations.js';
import { DocumentContentService } from '../document-content.service.js';
import {
  articlesBlockText,
  languageInstruction,
  REVISE_SYSTEM,
} from '../prompts.js';
import { reviseOutputSchema } from '../schemas.js';

/** An `original` is usable only when it matches the document exactly once. */
export function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/**
 * The correction chat: an instruction in, validated edits out.
 *
 * An edit whose `original` is not found exactly once in the current document
 * is dropped here rather than offered to the sender, because an edit that
 * cannot be located cannot be applied safely.
 */
@Processor(QUEUE.reviseDocument)
export class ReviseDocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviseDocumentProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LAW_SEARCH) private readonly lawSearch: LawSearchService,
    private readonly ai: AiService,
    private readonly content: DocumentContentService,
    private readonly usage: AiUsageService,
  ) {
    super();
  }

  async process(job: Job<ReviseDocumentJob>): Promise<void> {
    const { reviewId, userMessageId, assistantMessageId } = job.data;

    const [assistant] = await this.db
      .select()
      .from(aiReviewMessages)
      .where(eq(aiReviewMessages.id, assistantMessageId))
      .limit(1);
    if (!assistant) return;
    if (assistant.status === 'done') return;

    const [review] = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.id, reviewId))
      .limit(1);
    if (!review) {
      await this.fail(assistantMessageId, 'The review no longer exists');
      return;
    }

    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, review.documentId))
      .limit(1);
    if (!document) {
      await this.fail(assistantMessageId, 'The document no longer exists');
      return;
    }

    try {
      const history = await this.db
        .select({
          role: aiReviewMessages.role,
          text: aiReviewMessages.text,
          id: aiReviewMessages.id,
        })
        .from(aiReviewMessages)
        .where(eq(aiReviewMessages.reviewId, reviewId))
        .orderBy(asc(aiReviewMessages.createdAt));

      const instruction =
        history.find((m) => m.id === userMessageId)?.text ?? '';
      const loaded = await this.content.load(document);
      const documentBlocks = this.content.asContentBlocks(document, loaded);
      const hits = await this.retrieve(instruction, review.docType);

      const content: AiContentBlock[] = [
        { type: 'text', text: languageInstruction(review.language) },
        { type: 'text', text: this.historyBlock(history, assistantMessageId) },
        { type: 'text', text: articlesBlockText(hits) },
        ...documentBlocks,
      ];

      const revised = await this.ai.structured({
        label: 'revise',
        system: REVISE_SYSTEM,
        content,
        schema: reviseOutputSchema,
      });

      // Validation: the server decides which proposed edits are real.
      const usable = revised.output.edits.filter((edit) => {
        const found = occurrences(loaded.text, edit.original);
        if (found === 1) return true;
        this.logger.warn(
          `review ${reviewId}: dropped an edit whose original matched ` +
            `${found} times in the document`,
        );
        return false;
      });

      const check = await checkCitations(
        this.lawSearch,
        hits,
        usable.map((edit) => edit.articleId),
      );

      const editRows: NewAiEdit[] = usable.map((edit, index) => ({
        messageId: assistantMessageId,
        reviewId,
        documentId: document.id,
        clauseRef: edit.clauseRef,
        original: edit.original,
        replacement: edit.replacement,
        reason: edit.reason,
        citation: edit.articleId
          ? (check.snapshots.get(edit.articleId) ?? null)
          : null,
        orderIndex: index,
      }));

      await this.db.transaction(async (tx) => {
        await tx
          .delete(aiEdits)
          .where(eq(aiEdits.messageId, assistantMessageId));
        if (editRows.length > 0) await tx.insert(aiEdits).values(editRows);
        await tx
          .update(aiReviewMessages)
          .set({ text: revised.output.reply, status: 'done', error: null })
          .where(eq(aiReviewMessages.id, assistantMessageId));
      });

      await this.usage.recordRevision(
        { userId: review.requestedByUserId, agencyId: review.agencyId },
        revised.usage,
      );

      this.logger.log(
        `revision on review ${reviewId}: ${editRows.length} of ` +
          `${revised.output.edits.length} proposed edits kept`,
      );
    } catch (error) {
      const aiError = toAiError(error);
      const attempt = (job.attemptsMade ?? 0) + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      if (aiError.retryable && attempt < maxAttempts) throw aiError;
      await this.fail(assistantMessageId, aiError.message);
    }
  }

  /** Earlier turns as plain text; the pending assistant row is left out. */
  private historyBlock(
    history: { role: string; text: string; id: string }[],
    assistantMessageId: string,
  ): string {
    const lines = history
      .filter((m) => m.id !== assistantMessageId && m.text.trim().length > 0)
      .map((m) => `${m.role === 'user' ? 'Sender' : 'You'}: ${m.text}`)
      .join('\n\n');
    return `<conversation>\n${lines}\n</conversation>\n\nThe last Sender turn is the instruction to act on.`;
  }

  private async retrieve(
    instruction: string,
    docType: ReviseDocType,
  ): Promise<LawArticleHit[]> {
    try {
      return await this.lawSearch.search({
        queries: [instruction].filter((q) => q.trim().length > 0),
        docType: docType ?? undefined,
        limit: 20,
      });
    } catch (error) {
      this.logger.error(
        `law search failed, revising without articles: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return [];
    }
  }

  private async fail(messageId: string, message: string): Promise<void> {
    await this.db
      .update(aiReviewMessages)
      .set({ status: 'failed', error: message, text: '' })
      .where(eq(aiReviewMessages.id, messageId));
    this.logger.warn(`revision message ${messageId} failed: ${message}`);
  }
}

type ReviseDocType =
  'rental' | 'employment' | 'sale' | 'services' | 'nda' | 'other' | null;
