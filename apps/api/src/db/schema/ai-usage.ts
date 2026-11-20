import { sql } from 'drizzle-orm';
import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';
import { users } from './users.js';

/**
 * Monthly AI metering, one row per billing scope.
 *
 * `scopeKey` is `user:<id>` for an individual or `agency:<id>` for an agency,
 * so an agency's reviews pool across its members in a single counter row.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Billing month, `YYYY-MM` (UTC). */
    period: text().notNull(),
    scopeKey: text().notNull(),

    userId: uuid().references(() => users.id),
    agencyId: uuid().references(() => agencies.id),

    reviewsUsed: integer().notNull().default(0),
    revisionsUsed: integer().notNull().default(0),
    summariesUsed: integer().notNull().default(0),

    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 12, scale: 6 }).notNull().default('0'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique('ai_usage_period_scope_unique').on(t.period, t.scopeKey)],
);

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
