import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';
import { documents } from './documents.js';
import {
  aiLanguage,
  contractType,
  reviewStatus,
  riskLevel,
  verdict,
} from './enums.js';
import { users } from './users.js';

/** A contract party the model found, mapped to recipients on the send screen. */
export interface ReviewParty {
  name: string;
  role: string;
}

/** One AI legal review of one document version. */
export const aiReviews = pgTable(
  'ai_reviews',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    documentId: uuid()
      .notNull()
      .references(() => documents.id),
    requestedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    agencyId: uuid().references(() => agencies.id),

    status: reviewStatus().notNull().default('queued'),
    language: aiLanguage().notNull().default('uz'),

    docType: contractType(),
    parties: jsonb().$type<ReviewParty[]>(),

    riskLevel: riskLevel(),
    verdict: verdict(),
    summary: text(),

    /** "checked against legislation as of …", from the law index. */
    lawVersionDate: text(),
    promptVersion: text().notNull(),
    model: text().notNull(),

    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 10, scale: 6 }).notNull().default('0'),

    /**
     * `documentId:sha256:promptVersion:language`. A re-delivered job finds the
     * existing row instead of making a second pair of model calls.
     */
    idempotencyKey: text()
      .notNull()
      .unique('ai_reviews_idempotency_key_unique'),

    /** Short, safe reason. Never raw model output or a provider message. */
    error: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('ai_reviews_document_id_idx').on(t.documentId, t.createdAt),
    index('ai_reviews_requested_by_idx').on(t.requestedByUserId),
  ],
);

export type AiReview = typeof aiReviews.$inferSelect;
export type NewAiReview = typeof aiReviews.$inferInsert;
