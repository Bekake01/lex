import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';

export const accountStatus = pgEnum('account_status', ['active', 'suspended']);

export const agencyRole = pgEnum('agency_role', ['owner', 'admin', 'member']);

/**
 * Everyone who logs in (senders). One table, no tenants.
 *
 * - `agencyId` null: an individual user. Set: a member of that agency.
 *   A single column, so a user belongs to one agency at most.
 * - `passwordHash` (argon2) is null for a member the agency added who has not
 *   set a password yet (see email_codes, purpose `set_password`).
 * - Receivers who only sign through a link are not users.
 */
export const users = pgTable(
  'users',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    email: text().notNull().unique('users_email_unique'),
    passwordHash: text(),
    fullName: text().notNull(),
    phone: text(),
    status: accountStatus().notNull().default('active'),
    agencyId: uuid().references(() => agencies.id),
    agencyRole: agencyRole(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Forces normalized storage, which makes the plain unique index case-insensitive.
    check('users_email_normalized', sql`${t.email} = lower(trim(${t.email}))`),
    check(
      'users_full_name_length',
      sql`char_length(trim(${t.fullName})) between 1 and 200`,
    ),
    // An agency member always has a role; an individual never has one.
    check(
      'users_agency_role_pair',
      sql`(${t.agencyId} is null) = (${t.agencyRole} is null)`,
    ),
    // Listing an agency's members.
    index('users_agency_id_idx').on(t.agencyId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AgencyRole = (typeof agencyRole.enumValues)[number];
