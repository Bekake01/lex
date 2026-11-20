import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';
import { aiLanguage } from './enums.js';
import { users } from './users.js';

/** What A's `/documents/extract` returns, cached so we extract each file once. */
export interface ExtractedClause {
  ref: string;
  heading?: string;
  text: string;
  start: number;
  end: number;
}

/**
 * One uploaded contract file, or one version of it. The original bytes are
 * never modified: an accepted AI edit writes a new row with `version + 1` and
 * `parentDocumentId` pointing at the row it came from.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** Copied from the owner at upload, so an agency's quota can be pooled. */
    agencyId: uuid().references(() => agencies.id),

    name: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    /** Opaque key for StorageService (a path today, an object key later). */
    storageKey: text().notNull(),

    version: integer().notNull().default(1),
    /** The version this one was derived from; null for an upload. */
    parentDocumentId: uuid().references((): AnyPgColumn => documents.id),
    /** Version 1 of the chain, so listing versions is one indexed query. */
    rootDocumentId: uuid().references((): AnyPgColumn => documents.id),

    /** Cache of A's extraction. Null until the first review extracts it. */
    extractedText: text(),
    extractedLanguage: text(),
    extractedClauses: jsonb().$type<ExtractedClause[]>(),
    /** PDF with no text layer: the review sends the file to the model instead. */
    scanned: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('documents_owner_user_id_idx').on(t.ownerUserId),
    index('documents_root_document_id_idx').on(t.rootDocumentId, t.version),
    index('documents_parent_document_id_idx').on(t.parentDocumentId),
    check('documents_version_positive', sql`${t.version} >= 1`),
    check('documents_size_positive', sql`${t.sizeBytes} > 0`),
    // A v1 row has no parent; anything later does.
    check(
      'documents_parent_pair',
      sql`(${t.version} = 1) = (${t.parentDocumentId} is null)`,
    ),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

/** The language a sender asked AI output in, re-exported for convenience. */
export type AiLanguage = (typeof aiLanguage.enumValues)[number];
