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
import type { CitationSnapshot } from './ai-issues.js';
import { aiLanguage, messageRole, messageStatus } from './enums.js';
import { users } from './users.js';

/** The structured answer to a legal question, as stored (citations checked). */
export interface LegalAnswerBody {
  topic: string;
  urgent: { text: string; numbers: { label: string; number: string }[] } | null;
  summary: string;
  consequences: {
    title: string;
    text: string;
    citation: CitationSnapshot | null;
  }[];
  steps: string[];
  contacts: {
    kind: 'police' | 'medical' | 'court' | 'lawyer' | 'gov';
    name: string;
    detail: string;
    phone: string | null;
  }[];
  template: { title: string; text: string } | null;
  followUps: string[];
  /** The question is about checking a contract: offer the upload. */
  suggestContractReview: boolean;
}

/** A general legal Q&A conversation (`/ask`). One per "new chat". */
export const legalChats = pgTable(
  'legal_chats',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    agencyId: uuid().references(() => agencies.id),
    /** The first question, shortened; shown in the sidebar. */
    title: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('legal_chats_user_id_idx').on(t.userId, t.updatedAt)],
);

/**
 * One turn of a legal chat. A user message (the question) is answered by one
 * assistant message whose `answer` the `answer-question` job fills in.
 */
export const legalChatMessages = pgTable(
  'legal_chat_messages',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    chatId: uuid()
      .notNull()
      .references(() => legalChats.id, { onDelete: 'cascade' }),
    role: messageRole().notNull(),
    /** The question; empty on an assistant message. */
    text: text().notNull().default(''),
    status: messageStatus().notNull().default('done'),
    /** Assistant only, once `status = 'done'`. */
    answer: jsonb().$type<LegalAnswerBody>(),
    language: aiLanguage(),
    /** The user message this assistant message answers. */
    replyToMessageId: uuid(),
    /** Short, safe reason when `status = 'failed'`. */
    error: text(),

    model: text(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 10, scale: 6 }).notNull().default('0'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('legal_chat_messages_chat_id_idx').on(t.chatId, t.createdAt)],
);

export type LegalChat = typeof legalChats.$inferSelect;
export type LegalChatMessage = typeof legalChatMessages.$inferSelect;
