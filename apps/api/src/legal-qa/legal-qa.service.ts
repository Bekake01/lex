import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AskQuestionResponse,
  LegalAnswerWire,
  LegalChatListItem,
  LegalChatMessageWire,
  LegalChatWire,
} from '@lex/contracts';
import type { Queue } from 'bullmq';
import { and, asc, desc, eq } from 'drizzle-orm';
import { toCitationWire } from '../ai-review/mappers.js';
import type { CurrentUser } from '../common/current-user.js';
import { DB, type Db } from '../db/db.module.js';
import {
  legalChatMessages,
  legalChats,
  type LegalAnswerBody,
  type LegalChat,
  type LegalChatMessage,
} from '../db/schema/index.js';
import {
  jobIdForAnswer,
  QUEUE,
  type AnswerQuestionJob,
} from '../queue/queue.constants.js';

/** Sidebar titles: the first question, cut at a word near this length. */
const TITLE_LENGTH = 60;

export function chatTitle(question: string): string {
  const text = question.replace(/\s+/g, ' ').trim();
  if (text.length <= TITLE_LENGTH) return text;
  const cut = text.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The general legal Q&A (`/ask`). Like the review routes, nothing here calls
 * the model: a question is stored with a pending answer row, the
 * `answer-question` job fills it in, and the frontend polls the chat.
 */
@Injectable()
export class LegalQaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUE.answerQuestion) private readonly answerQueue: Queue,
  ) {}

  async list(user: CurrentUser): Promise<LegalChatListItem[]> {
    const chats = await this.db
      .select()
      .from(legalChats)
      .where(eq(legalChats.userId, user.id))
      .orderBy(desc(legalChats.updatedAt))
      .limit(30);
    return chats.map(toListItem);
  }

  async get(user: CurrentUser, chatId: string): Promise<LegalChatWire> {
    const chat = await this.chatForUser(user, chatId);
    const messages = await this.db
      .select()
      .from(legalChatMessages)
      .where(eq(legalChatMessages.chatId, chat.id))
      .orderBy(asc(legalChatMessages.createdAt));
    return { ...toListItem(chat), messages: messages.map(toMessageWire) };
  }

  /** A first question: a new chat. */
  async start(user: CurrentUser, text: string): Promise<AskQuestionResponse> {
    const [chat] = await this.db
      .insert(legalChats)
      .values({
        userId: user.id,
        agencyId: user.agencyId,
        title: chatTitle(text),
      })
      .returning({ id: legalChats.id });
    return this.ask(chat.id, text);
  }

  /** A follow-up question in an existing chat. */
  async followUp(
    user: CurrentUser,
    chatId: string,
    text: string,
  ): Promise<AskQuestionResponse> {
    const chat = await this.chatForUser(user, chatId);
    await this.db
      .update(legalChats)
      .set({ updatedAt: new Date() })
      .where(eq(legalChats.id, chat.id));
    return this.ask(chat.id, text);
  }

  private async ask(
    chatId: string,
    text: string,
  ): Promise<AskQuestionResponse> {
    const { userMessageId, assistantMessageId } = await this.db.transaction(
      async (tx) => {
        const [question] = await tx
          .insert(legalChatMessages)
          .values({ chatId, role: 'user', text, status: 'done' })
          .returning({ id: legalChatMessages.id });
        const [answer] = await tx
          .insert(legalChatMessages)
          .values({
            chatId,
            role: 'assistant',
            status: 'pending',
            replyToMessageId: question.id,
          })
          .returning({ id: legalChatMessages.id });
        return { userMessageId: question.id, assistantMessageId: answer.id };
      },
    );

    const payload: AnswerQuestionJob = {
      chatId,
      userMessageId,
      assistantMessageId,
    };
    await this.answerQueue.add(QUEUE.answerQuestion, payload, {
      jobId: jobIdForAnswer(assistantMessageId),
    });
    return { chatId, messageId: assistantMessageId };
  }

  /** A chat belongs to the person who started it; anyone else gets a 404. */
  private async chatForUser(
    user: CurrentUser,
    chatId: string,
  ): Promise<LegalChat> {
    const [chat] = await this.db
      .select()
      .from(legalChats)
      .where(and(eq(legalChats.id, chatId), eq(legalChats.userId, user.id)))
      .limit(1);
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }
}

function toListItem(chat: LegalChat): LegalChatListItem {
  return {
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt.toISOString(),
  };
}

function toMessageWire(message: LegalChatMessage): LegalChatMessageWire {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    status: message.status,
    answer:
      message.status === 'done' && message.answer
        ? toAnswerWire(message.answer)
        : null,
    error: message.error,
    createdAt: message.createdAt.toISOString(),
  };
}

/** Field by field, so nothing stored beyond the answer reaches a client. */
function toAnswerWire(a: LegalAnswerBody): LegalAnswerWire {
  return {
    topic: a.topic,
    urgent: a.urgent
      ? {
          text: a.urgent.text,
          numbers: a.urgent.numbers.map((n) => ({
            label: n.label,
            number: n.number,
          })),
        }
      : null,
    summary: a.summary,
    consequences: a.consequences.map((c) => ({
      title: c.title,
      text: c.text,
      citation: toCitationWire(c.citation),
    })),
    steps: [...a.steps],
    contacts: a.contacts.map((c) => ({
      kind: c.kind,
      name: c.name,
      detail: c.detail,
      phone: c.phone,
    })),
    template: a.template
      ? { title: a.template.title, text: a.template.text }
      : null,
    followUps: [...a.followUps],
    suggestContractReview: a.suggestContractReview,
  };
}
