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

/** A plain-language point and the clause it comes from ("" = not in the document). */
export interface SummaryPoint {
  text: string;
  clauseRef: string;
}

/**
 * The stored summary body. Matches `RecipientSummaryWire` minus the ids.
 * `youGet` … `howToEnd` were added on 2026-11-21; older rows lack them.
 * jsonb, so no migration.
 */
export interface SummaryBody {
  overview: string;
  yourObligations: SummaryObligation[];
  otherObligations: SummaryObligation[];
  keyConditions: { label: string; value: string }[];
  youGet?: SummaryPoint[];
  youGive?: SummaryPoint[];
  deadlines?: {
    when: string;
    what: string;
    who: 'you' | 'other' | 'both';
    clauseRef: string;
  }[];
  watchOut?: {
    text: string;
    severity: 'low' | 'medium' | 'high';
    clauseRef: string;
  }[];
  howToEnd?: SummaryPoint[];
}

/**
 * The plain-language summary of a send, computed at send time. One per send:
 * everyone signing it is the same party. `recipientId` is legacy (null for new
 * rows).
 *
 * `GET /sign/:token/summary` only ever reads this table: the signing path never
 * calls the model.
 */
export const recipientSummaries = pgTable(
  'recipient_summaries',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    signatureRequestId: uuid()
      .notNull()
      .references(() => signatureRequests.id, { onDelete: 'cascade' })
      .unique('recipient_summaries_signature_request_id_unique'),
    recipientId: uuid().references(() => recipients.id, {
      onDelete: 'cascade',
    }),

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
