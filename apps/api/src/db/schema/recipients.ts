import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { recipientStatus } from './enums.js';
import { signatureRequests } from './signature-requests.js';

/**
 * Someone who signs through a link. Not a user: a recipient has no account.
 *
 * `partyName` is which contract party they are (from
 * `GET /documents/:id/parties`), which is what the summary job needs to tell
 * "your obligations" from "the other party's".
 */
export const recipients = pgTable(
  'recipients',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    signatureRequestId: uuid()
      .notNull()
      .references(() => signatureRequests.id, { onDelete: 'cascade' }),

    email: text().notNull(),
    fullName: text().notNull(),
    partyName: text(),

    /** Secret in the signing link. The link works until the signature is done. */
    token: text().notNull().unique('recipients_token_unique'),

    status: recipientStatus().notNull().default('pending'),
    viewedAt: timestamp({ withTimezone: true }),
    signedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipients_signature_request_id_idx').on(t.signatureRequestId),
    check(
      'recipients_email_normalized',
      sql`${t.email} = lower(trim(${t.email}))`,
    ),
  ],
);

export type Recipient = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;
