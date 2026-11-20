import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';
import { documents } from './documents.js';
import {
  aiLanguage,
  signatureRequestStatus,
  summariesStatus,
} from './enums.js';
import { users } from './users.js';

/**
 * One send of one document version to one or more recipients.
 *
 * `documentHash` and `summaryHash` are the snapshot: they record exactly what
 * was sent and exactly which summaries the signers were shown, so the
 * certificate of completion can prove both.
 */
export const signatureRequests = pgTable(
  'signature_requests',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    documentId: uuid()
      .notNull()
      .references(() => documents.id),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    agencyId: uuid().references(() => agencies.id),

    status: signatureRequestStatus().notNull().default('pending'),
    /** sha256 of the document bytes at send time. */
    documentHash: text().notNull(),

    /** Language the recipient summaries were generated in. */
    summaryLanguage: aiLanguage().notNull().default('uz'),
    summariesStatus: summariesStatus().notNull().default('queued'),
    /** sha256 of the canonical JSON of all recipient summaries, in order. */
    summaryHash: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('signature_requests_document_id_idx').on(t.documentId),
    index('signature_requests_created_by_idx').on(t.createdByUserId),
  ],
);

export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type NewSignatureRequest = typeof signatureRequests.$inferInsert;
