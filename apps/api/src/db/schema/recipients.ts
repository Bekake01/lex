import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  deliveryChannel,
  recipientSource,
  recipientStatus,
  signatureMethod,
} from './enums.js';
import { signatureRequests } from './signature-requests.js';

/**
 * One person's copy of a send. Not a user: a recipient has no account.
 * Added by the sender (`source: invite`) or started from the open link.
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

    /** Set when the channel is email (normalized); used for the inbox. */
    email: text(),
    fullName: text(),
    partyName: text(),

    channel: deliveryChannel().notNull().default('link'),
    /** Email / phone / @username, normalized. Null for `link`. */
    contact: text(),
    source: recipientSource().notNull().default('invite'),

    /**
     * Secret in the signing link, minted at insert. A draft's tokens don't work
     * until the send is `sent`; the link closes after signing.
     */
    token: text().notNull().unique('recipients_token_unique'),

    status: recipientStatus().notNull().default('pending'),
    viewedAt: timestamp({ withTimezone: true }),
    signedAt: timestamp({ withTimezone: true }),

    // What the person submitted.
    signerName: text(),
    /** By field id. */
    fieldValues: jsonb().$type<Record<string, string>>().notNull().default({}),
    signatureMethod: signatureMethod(),
    signatureImageKey: text(),
    consentAt: timestamp({ withTimezone: true }),
    signerIp: text(),
    signerUserAgent: text(),

    // The sealed copy; downloadable once `signedPdfKey` is set.
    signedPdfKey: text(),
    certificateKey: text(),
    signedHash: text(),
    sealSignature: text(),
    sealKid: text(),

    /** Wrong passwords on this link; 10 = locked. */
    failedPasswordAttempts: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipients_signature_request_id_idx').on(t.signatureRequestId),
    index('recipients_email_idx').on(t.email),
    check(
      'recipients_email_normalized',
      sql`${t.email} is null or ${t.email} = lower(trim(${t.email}))`,
    ),
  ],
);

export type Recipient = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;
