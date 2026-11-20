import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AiLanguage,
  PartyWire,
  ReviewMessageWire,
  ReviewWire,
} from '@lex/contracts';
import type { Queue } from 'bullmq';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import { DB, type Db } from '../db/db.module.js';
import {
  aiEdits,
  aiIssues,
  aiReviewMessages,
  aiReviews,
  type AiReview,
  type Document,
} from '../db/schema/index.js';
import {
  assertAccess,
  DocumentsService,
} from '../documents/documents.service.js';
import {
  jobIdForAnalyze,
  jobIdForRevise,
  QUEUE,
  type AnalyzeDocumentJob,
  type ReviseDocumentJob,
} from '../queue/queue.constants.js';
import { AiUsageService } from '../usage/ai-usage.service.js';
import { AiService } from './ai.service.js';
import { toPartyWire, toReviewMessageWire, toReviewWire } from './mappers.js';

/**
 * Everything the review routes do, so the controllers stay thin.
 *
 * Nothing here calls Claude: a POST enqueues a job and returns an id, and the
 * frontend polls the GET. That keeps the request path free of AI latency and
 * makes every AI step retryable.
 */
@Injectable()
export class ReviewService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly documents: DocumentsService,
    private readonly usage: AiUsageService,
    private readonly ai: AiService,
    @InjectQueue(QUEUE.analyzeDocument) private readonly analyzeQueue: Queue,
    @InjectQueue(QUEUE.reviseDocument) private readonly reviseQueue: Queue,
  ) {}

  /* -------------------------------------------------------------- reviews -- */

  async createReview(
    user: CurrentUser,
    documentId: string,
    language: AiLanguage = 'uz',
  ): Promise<{ reviewId: string }> {
    const document = await this.documents.forUser(user, documentId);

    // Checked at enqueue, so the sender hears about the limit before any
    // tokens are spent.
    await this.usage.assertReviewAllowed(user);

    const idempotencyKey = [
      document.id,
      document.sha256,
      this.ai.promptVersion,
      language,
    ].join(':');

    const [existing] = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      // Same document, same prompt version, same language: the same review.
      // A failed one is worth another attempt; a finished one is returned.
      if (existing.status === 'failed') {
        await this.db
          .update(aiReviews)
          .set({ status: 'queued', error: null })
          .where(eq(aiReviews.id, existing.id));
        await this.enqueueAnalyze(existing.id);
      }
      return { reviewId: existing.id };
    }

    const [review] = await this.db
      .insert(aiReviews)
      .values({
        documentId: document.id,
        requestedByUserId: user.id,
        agencyId: user.agencyId,
        language,
        status: 'queued',
        promptVersion: this.ai.promptVersion,
        model: this.ai.model,
        idempotencyKey,
      })
      .returning({ id: aiReviews.id });

    await this.enqueueAnalyze(review.id);
    return { reviewId: review.id };
  }

  async getReview(user: CurrentUser, reviewId: string): Promise<ReviewWire> {
    const { review } = await this.reviewForUser(user, reviewId);
    const issues = await this.db
      .select()
      .from(aiIssues)
      .where(eq(aiIssues.reviewId, review.id))
      .orderBy(asc(aiIssues.orderIndex));
    return toReviewWire(review, issues);
  }

  async listReviews(
    user: CurrentUser,
    documentId: string,
  ): Promise<ReviewWire[]> {
    const document = await this.documents.forUser(user, documentId);
    const reviews = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.documentId, document.id))
      .orderBy(desc(aiReviews.createdAt));
    if (reviews.length === 0) return [];

    const issues = await this.db
      .select()
      .from(aiIssues)
      .where(
        inArray(
          aiIssues.reviewId,
          reviews.map((r) => r.id),
        ),
      )
      .orderBy(asc(aiIssues.orderIndex));

    return reviews.map((review) =>
      toReviewWire(
        review,
        issues.filter((issue) => issue.reviewId === review.id),
      ),
    );
  }

  /** Parties come from the newest finished review of the document. */
  async parties(user: CurrentUser, documentId: string): Promise<PartyWire[]> {
    const document = await this.documents.forUser(user, documentId);
    const [review] = await this.db
      .select({ parties: aiReviews.parties })
      .from(aiReviews)
      .where(
        and(
          eq(aiReviews.documentId, document.id),
          eq(aiReviews.status, 'done'),
          isNotNull(aiReviews.parties),
        ),
      )
      .orderBy(desc(aiReviews.createdAt))
      .limit(1);
    return (review?.parties ?? []).map(toPartyWire);
  }

  /* ------------------------------------------------------------- messages -- */

  async listMessages(
    user: CurrentUser,
    reviewId: string,
  ): Promise<ReviewMessageWire[]> {
    const { review } = await this.reviewForUser(user, reviewId);
    const messages = await this.db
      .select()
      .from(aiReviewMessages)
      .where(eq(aiReviewMessages.reviewId, review.id))
      .orderBy(asc(aiReviewMessages.createdAt));
    if (messages.length === 0) return [];

    const edits = await this.db
      .select()
      .from(aiEdits)
      .where(eq(aiEdits.reviewId, review.id))
      .orderBy(asc(aiEdits.orderIndex));

    return messages.map((message) =>
      toReviewMessageWire(
        message,
        edits.filter((edit) => edit.messageId === message.id),
      ),
    );
  }

  /**
   * A correction request. Writes the user's message and the assistant row that
   * will hold the answer, then enqueues the job that fills it in.
   */
  async createMessage(
    user: CurrentUser,
    reviewId: string,
    text: string,
  ): Promise<{ messageId: string }> {
    const { review } = await this.reviewForUser(user, reviewId);
    if (review.status !== 'done') {
      throw new ConflictException(
        'The review is not finished yet, so there is nothing to correct',
      );
    }

    const { userMessageId, assistantMessageId } = await this.db.transaction(
      async (tx) => {
        const [userMessage] = await tx
          .insert(aiReviewMessages)
          .values({
            reviewId: review.id,
            authorUserId: user.id,
            role: 'user',
            text,
            status: 'done',
          })
          .returning({ id: aiReviewMessages.id });

        const [assistantMessage] = await tx
          .insert(aiReviewMessages)
          .values({
            reviewId: review.id,
            role: 'assistant',
            text: '',
            status: 'pending',
            replyToMessageId: userMessage.id,
          })
          .returning({ id: aiReviewMessages.id });

        return {
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
        };
      },
    );

    const payload: ReviseDocumentJob = {
      reviewId: review.id,
      userMessageId,
      assistantMessageId,
    };
    await this.reviseQueue.add(QUEUE.reviseDocument, payload, {
      jobId: jobIdForRevise(review.id, userMessageId),
    });

    // The assistant row is what the frontend polls for the edits.
    return { messageId: assistantMessageId };
  }

  /* ------------------------------------------------------------- internals -- */

  async reviewForUser(
    user: CurrentUser,
    reviewId: string,
  ): Promise<{ review: AiReview; document: Document }> {
    const [review] = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.id, reviewId))
      .limit(1);
    if (!review) throw new NotFoundException('Review not found');

    const document = await this.documents.byId(review.documentId);
    if (!document) throw new NotFoundException('Review not found');
    assertAccess(user, document);

    return { review, document };
  }

  async enqueueAnalyze(reviewId: string): Promise<void> {
    const payload: AnalyzeDocumentJob = { reviewId };
    await this.analyzeQueue.add(QUEUE.analyzeDocument, payload, {
      jobId: jobIdForAnalyze(reviewId),
    });
  }
}
