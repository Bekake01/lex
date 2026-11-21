import type { Field, PageSize } from '@lex/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';
import { documents } from './documents.js';
import {
  aiLanguage,
  signatureRequestStatus,
  summariesStatus,
} from './enums.js';
import { users } from './users.js';

/**
 * One send: one PDF + one field layout to many people. Every recipient row is
 * that person's own copy (see `recipients.ts`).
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

    // A JS-side default: a SQL default of 'draft' would use the enum value in
    // the same migration transaction that adds it, which Postgres refuses.
    status: signatureRequestStatus()
      .notNull()
      .$default(() => 'draft'),
    /** sha256 of the document bytes (set at draft creation). */
    documentHash: text().notNull(),

    title: text().notNull(),
    message: text(),
    /** Which contract party the people are, for the AI summary. */
    partyName: text(),
    /** The editor layout; every person fills every field. */
    fields: jsonb().$type<Field[]>().notNull().default([]),
    pageCount: integer(),
    pageSizes: jsonb().$type<PageSize[]>(),

    /** Optional public link; `publicToken` is null while it is off. */
    openLinkEnabled: boolean().notNull().default(false),
    publicToken: text().unique('signature_requests_public_token_unique'),
    /** One password for every link of this send; null = no password. */
    passwordHash: text(),

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
    index('signature_requests_created_by_created_at_idx').on(
      t.createdByUserId,
      t.createdAt,
    ),
  ],
);

export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type NewSignatureRequest = typeof signatureRequests.$inferInsert;
