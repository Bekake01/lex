import { sql } from 'drizzle-orm';
import {
  check,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const emailCodePurpose = pgEnum('email_code_purpose', [
  // Forgot password: the code lets the user pick a new one.
  'reset_password',
  // A member added by an agency has no password yet; the code lets them set one.
  'set_password',
]);

/**
 * The one-time code emailed through Resend (6 digits, 10 minutes, 5 tries).
 *
 * - One row per user (the primary key): a new request overwrites the row,
 *   so the older code stops working.
 * - Using the code deletes the row. An unused or expired row stays until
 *   the next request overwrites it; there is no clean-up job.
 */
export const emailCodes = pgTable(
  'email_codes',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id),
    purpose: emailCodePurpose().notNull(),
    // HMAC-SHA256 (hex) with a server key: a plain hash of 6 digits would be
    // reversed at once from a leaked database.
    codeHash: text().notNull(),
    // Wrong tries; at 5 the code no longer works.
    attempts: smallint().notNull().default(0),
    // When the code was sent.
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    check('email_codes_attempts_range', sql`${t.attempts} between 0 and 5`),
    check(
      'email_codes_expires_after_created',
      sql`${t.expiresAt} > ${t.createdAt}`,
    ),
  ],
);

export type EmailCode = typeof emailCodes.$inferSelect;
export type NewEmailCode = typeof emailCodes.$inferInsert;
export type EmailCodePurpose = (typeof emailCodePurpose.enumValues)[number];
