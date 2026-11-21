import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';
import { agencyRole, users } from './users.js';

export const billingPlan = pgEnum('billing_plan', ['individual', 'company']);
export const billingInterval = pgEnum('billing_interval', ['month', 'year']);
export const subscriptionStatus = pgEnum('subscription_status', [
  'active',
  'canceled',
]);
export const paymentProvider = pgEnum('payment_provider', [
  'test',
  'payme',
  'click',
]);
export const paymentStatus = pgEnum('payment_status', ['paid', 'failed']);

/**
 * A paid plan. `scopeKey` is `user:<id>` (individual) or `agency:<id>`
 * (company), the same key `ai_usage` uses. One live row per scope: a new
 * checkout updates it. No row, or `currentPeriodEnd` in the past = free plan.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    scopeKey: text().notNull().unique('subscriptions_scope_unique'),
    userId: uuid().references(() => users.id),
    agencyId: uuid().references(() => agencies.id),
    plan: billingPlan().notNull(),
    interval: billingInterval().notNull(),
    seats: integer().notNull().default(1),
    status: subscriptionStatus().notNull().default('active'),
    currentPeriodEnd: timestamp({ withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

/** Every charge. Only `test` for now; Payme/Click later. */
export const payments = pgTable(
  'payments',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    scopeKey: text().notNull(),
    subscriptionId: uuid().references(() => subscriptions.id),
    paidByUserId: uuid()
      .notNull()
      .references(() => users.id),
    provider: paymentProvider().notNull(),
    /** Whole so'm. */
    amount: integer().notNull(),
    status: paymentStatus().notNull(),
    description: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payments_scope_idx').on(t.scopeKey)],
);

/** An invite link to join an agency. Only the token's hash is stored. */
export const agencyInvites = pgTable(
  'agency_invites',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    agencyId: uuid()
      .notNull()
      .references(() => agencies.id),
    email: text().notNull(),
    role: agencyRole().notNull(),
    tokenHash: text().notNull().unique('agency_invites_token_unique'),
    invitedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agency_invites_agency_idx').on(t.agencyId)],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AgencyInvite = typeof agencyInvites.$inferSelect;
