import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BILLING_ERROR_CODES,
  PLANS,
  planPrice,
  seatsPrice,
  type BillingInterval,
  type BillingOverviewWire,
  type CheckoutBody,
  type PaidPlanId,
  type PaymentWire,
  type SubscriptionWire,
} from '@lex/contracts';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import { DB, type Db } from '../db/db.module.js';
import {
  agencies,
  agencyInvites,
  payments,
  subscriptions,
  users,
  type Subscription,
} from '../db/schema/index.js';
import {
  activeSubscription,
  checkQuota,
  scopeKeyFor,
  sendQuota,
} from './plan-of.js';

/** Owner/admin of a company, or an individual managing their own plan. */
export function canManage(user: CurrentUser): boolean {
  return !user.agencyId || user.agencyRole !== 'member';
}

export function assertManager(user: CurrentUser): void {
  if (!canManage(user)) {
    throw new ForbiddenException({
      code: BILLING_ERROR_CODES.notManager,
      message: 'Buni faqat kompaniya egasi yoki admini qila oladi',
    });
  }
}

/** The end of a period that starts at `from`. */
export function addInterval(from: Date, interval: BillingInterval): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + (interval === 'year' ? 12 : 1));
  return end;
}

export function toSubscriptionWire(sub: Subscription): SubscriptionWire {
  return {
    id: sub.id,
    plan: sub.plan,
    interval: sub.interval,
    seats: sub.seats,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

/**
 * Plans, subscriptions and test payments.
 *
 * Payments are `test` only for now: checkout records a paid payment and
 * starts (or extends) the subscription at once. Payme/Click will replace
 * `charge()` with a redirect + webhook later. Nothing renews by itself.
 */
@Injectable()
export class BillingService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async overview(user: CurrentUser): Promise<BillingOverviewWire> {
    const scopeKey = scopeKeyFor(user);
    const [sub, checks, sends, team] = await Promise.all([
      activeSubscription(this.db, scopeKey),
      checkQuota(this.db, user),
      sendQuota(this.db, user),
      this.teamInfo(user),
    ]);
    return {
      plan: checks.plan,
      subscription: sub ? toSubscriptionWire(sub) : null,
      checks: {
        used: checks.used,
        limit: checks.limit,
        lifetime: checks.lifetime,
        period: checks.period,
      },
      sends,
      team: { ...team, seats: sub?.seats ?? 1 },
      canManage: canManage(user),
    };
  }

  async payments(user: CurrentUser): Promise<PaymentWire[]> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.scopeKey, scopeKeyFor(user)))
      .orderBy(desc(payments.createdAt))
      .limit(50);
    return rows.map((p) => ({
      id: p.id,
      provider: p.provider,
      amount: p.amount,
      status: p.status,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  /**
   * Buys a plan with a test payment. Individual: for an account outside a
   * company. Company: makes the account a company (its owner) when it isn't
   * one yet. Buying the same plan again extends it by one period.
   */
  async checkout(
    user: CurrentUser,
    body: CheckoutBody,
  ): Promise<BillingOverviewWire> {
    const plan = body.plan;
    const interval = body.interval;
    assertManager(user);

    if (plan === 'individual' && user.agencyId) {
      throw new ConflictException({
        code: BILLING_ERROR_CODES.alreadyInTeam,
        message: 'Siz kompaniya aʼzosisiz: kompaniya tarifi işlatiladi',
      });
    }

    let actor = user;
    if (plan === 'company' && !user.agencyId) {
      actor = await this.makeCompany(user, body.companyName);
    }

    const scopeKey = scopeKeyFor(actor);
    const members =
      plan === 'company' ? await this.memberCount(actor.agencyId!) : 1;
    const seats =
      plan === 'company'
        ? Math.max(
            body.seats ?? PLANS.company.includedSeats,
            PLANS.company.includedSeats,
            members,
          )
        : 1;
    const amount = planPrice(plan, interval, seats);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      const [current] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.scopeKey, scopeKey))
        .limit(1);
      // Same plan still running: the new period starts when the old one ends.
      const start =
        current &&
        current.plan === plan &&
        current.interval === interval &&
        current.currentPeriodEnd > now
          ? current.currentPeriodEnd
          : now;
      const values = {
        plan,
        interval,
        seats,
        status: 'active' as const,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: addInterval(start, interval),
      };
      const [sub] = await tx
        .insert(subscriptions)
        .values({
          scopeKey,
          userId: actor.agencyId ? null : actor.id,
          agencyId: actor.agencyId,
          ...values,
        })
        .onConflictDoUpdate({ target: subscriptions.scopeKey, set: values })
        .returning();
      await tx.insert(payments).values({
        scopeKey,
        subscriptionId: sub.id,
        paidByUserId: actor.id,
        provider: 'test',
        amount,
        status: 'paid',
        description: describe(plan, interval, seats),
      });
    });

    return this.overview(actor);
  }

  /** Stops renewal: the plan stays until the end of the paid period. */
  async cancel(user: CurrentUser): Promise<BillingOverviewWire> {
    await this.setCancel(user, true);
    return this.overview(user);
  }

  async resume(user: CurrentUser): Promise<BillingOverviewWire> {
    await this.setCancel(user, false);
    return this.overview(user);
  }

  /**
   * Company seats. Adding seats charges them for one period at once; removing
   * is free but can't go below the members + open invites, or the 5 included.
   */
  async changeSeats(
    user: CurrentUser,
    seats: number,
  ): Promise<BillingOverviewWire> {
    assertManager(user);
    const sub = await this.requireSubscription(user);
    if (sub.plan !== 'company' || !user.agencyId) {
      throw new BadRequestException('Seats are for the company plan');
    }
    const taken = await this.seatsTaken(user.agencyId);
    if (!Number.isInteger(seats) || seats < PLANS.company.includedSeats) {
      throw new BadRequestException(
        `seats must be at least ${PLANS.company.includedSeats}`,
      );
    }
    if (seats < taken) {
      throw new ConflictException({
        code: BILLING_ERROR_CODES.seatsFull,
        message: `${taken} ta örin band: avval aʼzo yoki taklifni öçiring`,
      });
    }

    const added = seats - sub.seats;
    await this.db.transaction(async (tx) => {
      await tx
        .update(subscriptions)
        .set({ seats })
        .where(eq(subscriptions.id, sub.id));
      if (added > 0) {
        await tx.insert(payments).values({
          scopeKey: sub.scopeKey,
          subscriptionId: sub.id,
          paidByUserId: user.id,
          provider: 'test',
          amount: seatsPrice(added, sub.interval),
          status: 'paid',
          description: `+${added} foydalanuvçi (${sub.interval === 'year' ? 'yillik' : 'oylik'})`,
        });
      }
    });
    return this.overview(user);
  }

  /** Members plus open invites: what uses a seat. */
  async seatsTaken(agencyId: string): Promise<number> {
    const pending = await this.db.$count(
      agencyInvites,
      and(
        eq(agencyInvites.agencyId, agencyId),
        isNull(agencyInvites.acceptedAt),
        isNull(agencyInvites.revokedAt),
        gt(agencyInvites.expiresAt, new Date()),
      ),
    );
    return (await this.memberCount(agencyId)) + pending;
  }

  /** Seats the company paid for (1 without a live company plan). */
  async seatsPaid(agencyId: string): Promise<number> {
    const sub = await activeSubscription(this.db, `agency:${agencyId}`);
    return sub?.plan === 'company' ? sub.seats : 1;
  }

  memberCount(agencyId: string): Promise<number> {
    return this.db.$count(users, eq(users.agencyId, agencyId));
  }

  private async makeCompany(
    user: CurrentUser,
    name: string | undefined,
  ): Promise<CurrentUser> {
    const companyName = name?.trim();
    if (!companyName || companyName.length > 200) {
      throw new BadRequestException('companyName is required');
    }
    return this.db.transaction(async (tx) => {
      const [agency] = await tx
        .insert(agencies)
        .values({ name: companyName })
        .returning({ id: agencies.id });
      await tx
        .update(users)
        .set({ agencyId: agency.id, agencyRole: 'owner' })
        .where(eq(users.id, user.id));
      return { id: user.id, agencyId: agency.id, agencyRole: 'owner' as const };
    });
  }

  private async setCancel(user: CurrentUser, cancel: boolean): Promise<void> {
    assertManager(user);
    const sub = await this.requireSubscription(user);
    await this.db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: cancel })
      .where(eq(subscriptions.id, sub.id));
  }

  private async requireSubscription(user: CurrentUser): Promise<Subscription> {
    const sub = await activeSubscription(this.db, scopeKeyFor(user));
    if (!sub) throw new NotFoundException('No active subscription');
    return sub;
  }

  private async teamInfo(user: CurrentUser) {
    if (!user.agencyId) {
      return { agencyId: null, agencyName: null, role: null, members: 1 };
    }
    const [agency] = await this.db
      .select({ name: agencies.name })
      .from(agencies)
      .where(eq(agencies.id, user.agencyId))
      .limit(1);
    return {
      agencyId: user.agencyId,
      agencyName: agency?.name ?? null,
      role: user.agencyRole,
      members: await this.memberCount(user.agencyId),
    };
  }
}

function describe(
  plan: PaidPlanId,
  interval: BillingInterval,
  seats: number,
): string {
  const period = interval === 'year' ? 'yillik' : 'oylik';
  return plan === 'company'
    ? `${PLANS.company.name}, ${seats} foydalanuvçi (${period})`
    : `${PLANS.individual.name} (${period})`;
}
