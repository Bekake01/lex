import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  inet,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const sessionRevokeReason = pgEnum('session_revoke_reason', [
  'logout',
  'reuse_detected',
  'password_changed',
  'admin_suspended',
]);

// One row per login (one browser). The refresh token is
// "<session id>.<secret>": refresh finds the row by id and compares hashes,
// so a token from any earlier rotation is recognized as reuse.
export const sessions = pgTable(
  'sessions',
  {
    // Also the `sid` claim in access tokens.
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    rememberMe: boolean().notNull(),

    // SHA-256 (hex) of the current secret. The secret is 32 random bytes,
    // so a slow hash like argon2 would add nothing.
    tokenHash: text().notNull(),
    // The secret this one replaced, accepted until rotatedAt + the grace period
    // so parallel tabs refreshing at once are not logged out.
    previousTokenHash: text(),
    rotatedAt: timestamp({ withTimezone: true }),

    userAgent: text(),
    ip: inet(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Moves forward on each refresh, never past absoluteExpiresAt.
    idleExpiresAt: timestamp({ withTimezone: true }).notNull(),
    // Fixed at creation.
    absoluteExpiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedReason: sessionRevokeReason(),
  },
  (t) => [
    // Revoking all of a user's sessions (password change, suspend).
    index('sessions_user_id_idx').on(t.userId),
    check(
      'sessions_idle_within_absolute',
      sql`${t.idleExpiresAt} <= ${t.absoluteExpiresAt}`,
    ),
    check(
      'sessions_rotation_pair',
      sql`(${t.previousTokenHash} is null) = (${t.rotatedAt} is null)`,
    ),
    check(
      'sessions_revoke_pair',
      sql`(${t.revokedAt} is null) = (${t.revokedReason} is null)`,
    ),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
