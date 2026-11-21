import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, asc, eq, lt } from 'drizzle-orm';
import { toAiError } from '../ai-review/ai-errors.js';
import { addUsage, AiService } from '../ai-review/ai.service.js';
import { checkCitations } from '../ai-review/citations.js';
import {
  languageInstruction,
  QA_ANSWER_SYSTEM,
  QA_PLAN_SYSTEM,
  qaArticlesBlockText,
  qaConversationBlockText,
} from '../ai-review/prompts.js';
import {
  qaAnswerOutputSchema,
  qaPlanOutputSchema,
} from '../ai-review/schemas.js';
import { DB, type Db } from '../db/db.module.js';
import {
  legalChatMessages,
  legalChats,
  type LegalAnswerBody,
} from '../db/schema/index.js';
import {
  LAW_SEARCH,
  type LawArticleHit,
  type LawSearchService,
} from '../law-search/law-search.types.js';
import {
  AI_WORKER_OPTIONS,
  QUEUE,
  type AnswerQuestionJob,
} from '../queue/queue.constants.js';
import { AiUsageService } from '../usage/ai-usage.service.js';

/** Earlier turns sent as context for a follow-up question. */
const HISTORY_TURNS = 4;

/**
 * Answers one legal question: plan (language + law search queries) → law
 * search → answer → server-side citation check → save.
 *
 * Both calls run on the light model: this is a chat, so speed matters more
 * than it does for a contract review, and every legal point still has to
 * stand on an article that was actually retrieved.
 */
@Processor(QUEUE.answerQuestion, AI_WORKER_OPTIONS)
export class AnswerQuestionProcessor extends WorkerHost {
  private readonly logger = new Logger(AnswerQuestionProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LAW_SEARCH) private readonly lawSearch: LawSearchService,
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
  ) {
    super();
  }

  async process(job: Job<AnswerQuestionJob>): Promise<void> {
    const { chatId, userMessageId, assistantMessageId } = job.data;

    const [assistant] = await this.db
      .select()
      .from(legalChatMessages)
      .where(eq(legalChatMessages.id, assistantMessageId))
      .limit(1);
    if (!assistant || assistant.status === 'done') return;

    const [chat] = await this.db
      .select()
      .from(legalChats)
      .where(eq(legalChats.id, chatId))
      .limit(1);
    const [question] = await this.db
      .select()
      .from(legalChatMessages)
      .where(eq(legalChatMessages.id, userMessageId))
      .limit(1);
    if (!chat || !question) {
      await this.fail(assistantMessageId, 'The question no longer exists');
      return;
    }

    try {
      const conversation = qaConversationBlockText(
        await this.history(chatId, question.createdAt),
        question.text,
      );

      // Call 1: which language, and what to look up in the law.
      const plan = await this.ai.structured({
        label: 'qa-plan',
        system: QA_PLAN_SYSTEM,
        content: [{ type: 'text', text: conversation }],
        schema: qaPlanOutputSchema,
        tier: 'light',
        effort: 'low',
        maxTokens: 4_000,
      });

      const hits = await this.retrieve(plan.output.searchQueries);

      // Call 2: the answer, grounded in the retrieved articles.
      const answered = await this.ai.structured({
        label: 'qa-answer',
        system: QA_ANSWER_SYSTEM,
        content: [
          { type: 'text', text: languageInstruction(plan.output.language) },
          { type: 'text', text: qaArticlesBlockText(hits) },
          { type: 'text', text: conversation },
        ],
        schema: qaAnswerOutputSchema,
        tier: 'light',
        effort: 'medium',
        maxTokens: 16_000,
      });
      const out = answered.output;

      // The server decides what may be cited: an id that was not retrieved
      // becomes `citation: null`, and the point keeps its text.
      const check = await checkCitations(
        this.lawSearch,
        hits,
        out.consequences.map((c) => c.articleId),
      );

      const answer: LegalAnswerBody = {
        topic: out.topic,
        urgent: out.urgent,
        summary: out.summary,
        consequences: out.consequences.map((c) => ({
          title: c.title,
          text: c.text,
          citation: c.articleId
            ? (check.snapshots.get(c.articleId) ?? null)
            : null,
        })),
        steps: out.steps,
        contacts: out.contacts,
        template: out.template,
        followUps: out.followUps,
        suggestContractReview: out.suggestContractReview,
      };
      const usage = addUsage(plan.usage, answered.usage);

      await this.db
        .update(legalChatMessages)
        .set({
          status: 'done',
          answer,
          language: plan.output.language,
          error: null,
          model: answered.model,
          inputTokens: usage.inputTokens + usage.cacheReadTokens,
          outputTokens: usage.outputTokens,
          costUsd: usage.costUsd.toFixed(6),
        })
        .where(eq(legalChatMessages.id, assistantMessageId));

      await this.usage.recordQuestion(
        { userId: chat.userId, agencyId: chat.agencyId },
        usage,
      );

      this.logger.log(
        `answer ${assistantMessageId}: ${hits.length} articles, ` +
          `${check.snapshots.size} cited`,
      );
    } catch (error) {
      const aiError = toAiError(error);
      const attempt = (job.attemptsMade ?? 0) + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      if (aiError.retryable && attempt < maxAttempts) throw aiError;
      await this.fail(assistantMessageId, aiError.message);
    }
  }

  /** The last few finished turns before this question, oldest first. */
  private async history(
    chatId: string,
    before: Date,
  ): Promise<{ question: string; answerSummary: string | null }[]> {
    const rows = await this.db
      .select()
      .from(legalChatMessages)
      .where(
        and(
          eq(legalChatMessages.chatId, chatId),
          lt(legalChatMessages.createdAt, before),
        ),
      )
      .orderBy(asc(legalChatMessages.createdAt));

    const turns = rows
      .filter((m) => m.role === 'user')
      .map((q) => ({
        question: q.text,
        answerSummary:
          rows.find((m) => m.replyToMessageId === q.id)?.answer?.summary ??
          null,
      }));
    return turns.slice(-HISTORY_TURNS);
  }

  private async retrieve(queries: string[]): Promise<LawArticleHit[]> {
    if (queries.length === 0) return [];
    try {
      return await this.lawSearch.search({ queries, limit: 15 });
    } catch (error) {
      this.logger.error(
        `law search failed, answering without articles: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return [];
    }
  }

  private async fail(messageId: string, message: string): Promise<void> {
    await this.db
      .update(legalChatMessages)
      .set({ status: 'failed', error: message })
      .where(eq(legalChatMessages.id, messageId));
    this.logger.warn(`answer ${messageId} failed: ${message}`);
  }
}
