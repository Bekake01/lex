import { FREE_CHECKS, FREE_SENDS, PLANS, type PlanId } from '@lex/contracts';
import { and, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import type { Db } from '../db/db.module.js';
import {
  aiUsage,
  signatureRequests,
  subscriptions,
  type Subscription,
} from '../db/schema/index.js';

/** `agency:<id>` pools a company's quota across its members. */
export function scopeKeyFor(user: Pick<CurrentUser, 'id' | 'agencyId'>): string {
  return user.agencyId ? `agency:${user.agencyId}` : `user:${user.id}`;
}

/** Billing month in UTC, `YYYY-MM`. */
export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** The scope's paid subscription while its period runs, else null (free). */
export async function activeSubscription(
  db: Db,
  scopeKey: string,
  now = new Date(),
): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.scopeKey, scopeKey),
        gt(subscriptions.currentPeriodEnd, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface CheckQuota {
  plan: PlanId;
  used: number;
  limit: number;
  /** Free plan: counted over the account's lifetime, not per month. */
  lifetime: boolean;
  period: string | null;
}

/**
 * How many AI checks the caller's account has used against its plan.
 * Free: lifetime total of every month. Paid: this calendar month.
 */
export async function checkQuota(
  db: Db,
  user: Pick<CurrentUser, 'id' | 'agencyId'>,
  now = new Date(),
): Promise<CheckQuota> {
  const scopeKey = scopeKeyFor(user);
  const sub = await activeSubscription(db, scopeKey, now);

  if (!sub) {
    const [row] = await db
      .select({
        used: sql<number>`coalesce(sum(${aiUsage.reviewsUsed}), 0)::int`,
      })
      .from(aiUsage)
      .where(eq(aiUsage.scopeKey, scopeKey));
    return {
      plan: 'free',
      used: Number(row?.used ?? 0),
      limit: FREE_CHECKS,
      lifetime: true,
      period: null,
    };
  }

  const period = currentPeriod(now);
  const [row] = await db
    .select({ used: aiUsage.reviewsUsed })
    .from(aiUsage)
    .where(and(eq(aiUsage.scopeKey, scopeKey), eq(aiUsage.period, period)))
    .limit(1);
  return {
    plan: sub.plan,
    used: row?.used ?? 0,
    limit: PLANS[sub.plan].checks,
    lifetime: false,
    period,
  };
}

/** Signature sends made by the account, and its limit (null = unlimited). */
export async function sendQuota(
  db: Db,
  user: Pick<CurrentUser, 'id' | 'agencyId'>,
  now = new Date(),
): Promise<{ used: number; limit: number | null }> {
  const sub = await activeSubscription(db, scopeKeyFor(user), now);
  const owner = user.agencyId
    ? eq(signatureRequests.agencyId, user.agencyId)
    : and(
        eq(signatureRequests.createdByUserId, user.id),
        isNull(signatureRequests.agencyId),
      );
  const used = await db.$count(
    signatureRequests,
    and(owner, isNotNull(signatureRequests.sentAt)),
  );
  return { used, limit: sub ? null : FREE_SENDS };
}
