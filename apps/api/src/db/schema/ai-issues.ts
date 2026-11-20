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
import { aiReviews } from './ai-reviews.js';
import { severity } from './enums.js';

/**
 * A snapshot of the cited article, taken when the review ran. Stored so the
 * wire mapper never has to call the law service again, and so an old review
 * keeps showing the law text it was actually based on.
 */
export interface CitationSnapshot {
  articleId: string;
  actTitle: string;
  articleNumber: string | null;
  sourceUrl: string;
  versionDate: string;
}

/** One finding. `citation` is null when no retrieved article supported it. */
export const aiIssues = pgTable(
  'ai_issues',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    reviewId: uuid()
      .notNull()
      .references(() => aiReviews.id, { onDelete: 'cascade' }),

    clauseRef: text().notNull(),
    quote: text().notNull(),
    problem: text().notNull(),
    severity: severity().notNull(),
    recommendation: text().notNull(),

    citation: jsonb().$type<CitationSnapshot>(),
    /** Keeps the order Claude returned, which is roughly by importance. */
    orderIndex: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_issues_review_id_idx').on(t.reviewId, t.orderIndex)],
);

export type AiIssue = typeof aiIssues.$inferSelect;
export type NewAiIssue = typeof aiIssues.$inferInsert;
