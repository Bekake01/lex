import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { aiReviews } from './ai-reviews.js';
import { messageRole, messageStatus } from './enums.js';
import { users } from './users.js';

/**
 * The correction chat on a review. A user message is answered by one assistant
 * message carrying the proposed edits (see `ai_edits`).
 */
export const aiReviewMessages = pgTable(
  'ai_review_messages',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    reviewId: uuid()
      .notNull()
      .references(() => aiReviews.id, { onDelete: 'cascade' }),
    /** Null on an assistant message. */
    authorUserId: uuid().references(() => users.id),

    role: messageRole().notNull(),
    text: text().notNull().default(''),
    status: messageStatus().notNull().default('done'),

    /** The user message this assistant message answers. */
    replyToMessageId: uuid(),
    /** Short, safe reason when `status = 'failed'`. */
    error: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_review_messages_review_id_idx').on(t.reviewId, t.createdAt),
  ],
);

export type AiReviewMessage = typeof aiReviewMessages.$inferSelect;
export type NewAiReviewMessage = typeof aiReviewMessages.$inferInsert;
