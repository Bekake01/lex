import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BILLING_ERROR_CODES, type AiUsageWire } from '@lex/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import { DB, type Db } from '../db/db.module.js';
import { aiUsage } from '../db/schema/index.js';
import type { AiUsageTotals } from '../ai-review/ai.service.js';
import {
  checkQuota,
  currentPeriod,
  scopeKeyFor,
  sendQuota,
} from '../billing/plan-of.js';

export { currentPeriod, scopeKeyFor };

/**
 * AI metering and plan limits (see `@lex/contracts` PLANS).
 *
 * Free accounts get FREE_CHECKS for life; paid plans a monthly quota. The
 * limit is checked **at enqueue**, so a sender finds out before a job starts
 * spending tokens, and the counter is incremented when a job finishes.
 */
@Injectable()
export class AiUsageService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(user: CurrentUser, period = currentPeriod()): Promise<AiUsageWire> {
    const quota = await checkQuota(this.db, user);
    const [row] = await this.db
      .select({ revisionsUsed: aiUsage.revisionsUsed })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.period, period),
          eq(aiUsage.scopeKey, scopeKeyFor(user)),
        ),
      )
      .limit(1);

    return {
      period,
      reviewsUsed: quota.used,
      reviewsLimit: quota.limit,
      revisionsUsed: row?.revisionsUsed ?? 0,
    };
  }

  /** 402 `REVIEW_LIMIT_REACHED` when the plan's checks are used up. */
  async assertReviewAllowed(user: CurrentUser): Promise<void> {
    const quota = await checkQuota(this.db, user);
    if (quota.used >= quota.limit) {
      throw new HttpException(
        {
          code: BILLING_ERROR_CODES.checkLimitReached,
          message:
            quota.plan === 'free'
              ? 'Bepul AI tekşiruvlar tugadi. Davom etiş uçun tarif tanlang.'
              : 'Bu oy uçun AI tekşiruvlar tugadi.',
          plan: quota.plan,
          reviewsUsed: quota.used,
          reviewsLimit: quota.limit,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** 402 `SEND_LIMIT_REACHED` when a free account used its signature sends. */
  async assertSendAllowed(user: CurrentUser): Promise<void> {
    const quota = await sendQuota(this.db, user);
    if (quota.limit !== null && quota.used >= quota.limit) {
      throw new HttpException(
        {
          code: BILLING_ERROR_CODES.sendLimitReached,
          message:
            'Bepul imzoga yuborişlar tugadi. Davom etiş uçun tarif tanlang.',
          sendsUsed: quota.used,
          sendsLimit: quota.limit,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  recordReview(scope: UsageScope, usage: AiUsageTotals) {
    return this.increment(scope, usage, { reviewsUsed: 1 });
  }

  recordRevision(scope: UsageScope, usage: AiUsageTotals) {
    return this.increment(scope, usage, { revisionsUsed: 1 });
  }

  recordSummaries(scope: UsageScope, usage: AiUsageTotals, count: number) {
    return this.increment(scope, usage, { summariesUsed: count });
  }

  /** Legal Q&A answers are free on every plan: cost and tokens only. */
  recordQuestion(scope: UsageScope, usage: AiUsageTotals) {
    return this.increment(scope, usage, {});
  }

  /**
   * One upsert per job: the row is created on first use and incremented after
   * that, so a re-delivered job that already finished never double-counts
   * (the processors return early before calling this).
   */
  private async increment(
    scope: UsageScope,
    usage: AiUsageTotals,
    counters: {
      reviewsUsed?: number;
      revisionsUsed?: number;
      summariesUsed?: number;
    },
  ): Promise<void> {
    const period = currentPeriod();
    const scopeKey = scope.agencyId
      ? `agency:${scope.agencyId}`
      : `user:${scope.userId}`;
    const reviews = counters.reviewsUsed ?? 0;
    const revisions = counters.revisionsUsed ?? 0;
    const summaries = counters.summariesUsed ?? 0;
    const cost = usage.costUsd.toFixed(6);

    await this.db
      .insert(aiUsage)
      .values({
        period,
        scopeKey,
        userId: scope.agencyId ? null : scope.userId,
        agencyId: scope.agencyId,
        reviewsUsed: reviews,
        revisionsUsed: revisions,
        summariesUsed: summaries,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        costUsd: cost,
      })
      .onConflictDoUpdate({
        target: [aiUsage.period, aiUsage.scopeKey],
        set: {
          reviewsUsed: sql`${aiUsage.reviewsUsed} + ${reviews}`,
          revisionsUsed: sql`${aiUsage.revisionsUsed} + ${revisions}`,
          summariesUsed: sql`${aiUsage.summariesUsed} + ${summaries}`,
          inputTokens: sql`${aiUsage.inputTokens} + ${usage.inputTokens}`,
          outputTokens: sql`${aiUsage.outputTokens} + ${usage.outputTokens}`,
          cacheReadTokens: sql`${aiUsage.cacheReadTokens} + ${usage.cacheReadTokens}`,
          costUsd: sql`${aiUsage.costUsd} + ${cost}`,
          updatedAt: new Date(),
        },
      });
  }
}

/** Who to bill. Jobs carry ids, not a request-scoped `CurrentUser`. */
export interface UsageScope {
  userId: string;
  agencyId: string | null;
}
