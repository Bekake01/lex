import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aiReviewMessages } from './ai-review-messages.js';
import { aiReviews } from './ai-reviews.js';
import type { CitationSnapshot } from './ai-issues.js';
import { documents } from './documents.js';
import { editStatus } from './enums.js';

/**
 * One proposed text replacement. `original` was verified to appear exactly once
 * in `documentId`'s text when the edit was created, and is checked again before
 * it is applied.
 */
export const aiEdits = pgTable(
  'ai_edits',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    messageId: uuid()
      .notNull()
      .references(() => aiReviewMessages.id, { onDelete: 'cascade' }),
    reviewId: uuid()
      .notNull()
      .references(() => aiReviews.id, { onDelete: 'cascade' }),
    /** The document version this edit was computed against. */
    documentId: uuid()
      .notNull()
      .references(() => documents.id),

    clauseRef: text().notNull(),
    original: text().notNull(),
    replacement: text().notNull(),
    reason: text().notNull(),
    citation: jsonb().$type<CitationSnapshot>(),

    status: editStatus().notNull().default('proposed'),
    orderIndex: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('ai_edits_message_id_idx').on(t.messageId, t.orderIndex),
    index('ai_edits_review_id_idx').on(t.reviewId),
  ],
);

export type AiEdit = typeof aiEdits.$inferSelect;
export type NewAiEdit = typeof aiEdits.$inferInsert;
