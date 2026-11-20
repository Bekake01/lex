import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AI_ERROR_CODES, type AiUsageWire } from '@lex/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { aiUsage } from '../db/schema/index.js';
import type { AiUsageTotals } from '../ai-review/ai.service.js';

/** `agency:<id>` pools an agency's quota across its members. */
export function scopeKeyFor(user: CurrentUser): string {
  return user.agencyId ? `agency:${user.agencyId}` : `user:${user.id}`;
}

/** Billing month in UTC, `YYYY-MM`. */
export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Monthly AI metering and plan limits.
 *
 * The limit is checked **at enqueue**, so a sender finds out before a job
 * starts spending tokens, and the counter is incremented when a job finishes.
 */
@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** null = unlimited. */
  reviewLimitFor(user: CurrentUser): number | null {
    const limit = user.agencyId
      ? this.env.AI_REVIEWS_LIMIT_AGENCY
      : this.env.AI_REVIEWS_LIMIT_PERSONAL;
    return limit === 0 ? null : limit;
  }

  async get(user: CurrentUser, period = currentPeriod()): Promise<AiUsageWire> {
    const [row] = await this.db
      .select({
        reviewsUsed: aiUsage.reviewsUsed,
        revisionsUsed: aiUsage.revisionsUsed,
      })
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
      reviewsUsed: row?.reviewsUsed ?? 0,
      reviewsLimit: this.reviewLimitFor(user),
      revisionsUsed: row?.revisionsUsed ?? 0,
    };
  }

  /**
   * Throws the same 402 shape as the existing trial check when the monthly
   * review quota is used up.
   */
  async assertReviewAllowed(user: CurrentUser): Promise<void> {
    const limit = this.reviewLimitFor(user);
    if (limit === null) return;

    const usage = await this.get(user);
    if (usage.reviewsUsed >= limit) {
      throw new HttpException(
        {
          code: AI_ERROR_CODES.reviewLimitReached,
          message: 'The monthly AI review limit for this plan is used up',
          reviewsUsed: usage.reviewsUsed,
          reviewsLimit: limit,
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
