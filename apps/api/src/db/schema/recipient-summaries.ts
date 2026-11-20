import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aiLanguage } from './enums.js';
import { recipients } from './recipients.js';
import { signatureRequests } from './signature-requests.js';

/** Obligation as shown on the signing page. */
export interface SummaryObligation {
  text: string;
  deadline?: string;
  penalty?: string;
  clauseRef: string;
}

/** The stored summary body. Matches `RecipientSummaryWire` minus the ids. */
export interface SummaryBody {
  overview: string;
  yourObligations: SummaryObligation[];
  otherObligations: SummaryObligation[];
  keyConditions: { label: string; value: string }[];
}

/**
 * One recipient's plain-language summary, computed at send time.
 *
 * `GET /sign/:token/summary` only ever reads this table: the signing path never
 * calls Claude.
 */
export const recipientSummaries = pgTable(
  'recipient_summaries',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    signatureRequestId: uuid()
      .notNull()
      .references(() => signatureRequests.id, { onDelete: 'cascade' }),
    recipientId: uuid()
      .notNull()
      .references(() => recipients.id, { onDelete: 'cascade' })
      .unique('recipient_summaries_recipient_id_unique'),

    partyName: text().notNull(),
    language: aiLanguage().notNull(),
    body: jsonb().$type<SummaryBody>().notNull(),
    /** sha256 of the canonical JSON of `body`. Goes in the certificate. */
    summaryHash: text().notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipient_summaries_signature_request_id_idx').on(
      t.signatureRequestId,
    ),
  ],
);

export type RecipientSummary = typeof recipientSummaries.$inferSelect;
export type NewRecipientSummary = typeof recipientSummaries.$inferInsert;
