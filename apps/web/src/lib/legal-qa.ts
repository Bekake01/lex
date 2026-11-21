import {
  API_PATHS,
  type AskQuestionResponse,
  type LegalChatListItem,
  type LegalChatWire,
} from '@lex/contracts';
import { apiFetch } from '@/lib/auth';
import { json, postJson } from '@/lib/review';

// Browser only, like lib/auth.ts. The legal Q&A chat (`/ask`): a question
// returns at once, and the answer is polled with `getChat` until settled.

/** Asks in a new chat (`chatId` null) or as a follow-up in an existing one. */
export async function askQuestion(chatId: string | null, text: string): Promise<AskQuestionResponse> {
  const path = chatId ? API_PATHS.legalChatMessages(chatId) : API_PATHS.legalChats;
  const res = await json<AskQuestionResponse>(await apiFetch(path, postJson({ text })));
  chatsChanged();
  return res;
}

export async function getChat(id: string): Promise<LegalChatWire> {
  return json(await apiFetch(API_PATHS.legalChat(id)));
}

/** The sidebar's recent chats, newest first. */
export async function listChats(): Promise<LegalChatListItem[]> {
  return json(await apiFetch(API_PATHS.legalChats));
}

/** The chat is settled once no answer is still being written. */
export const chatSettled = (chat: LegalChatWire) => !chat.messages.some((m) => m.status === 'pending');

const CHATS_CHANGED = 'lex:chats-changed';

/** Tells the sidebar to reload its recent chats. */
export function chatsChanged(): void {
  window.dispatchEvent(new Event(CHATS_CHANGED));
}

export function onChatsChanged(listener: () => void): () => void {
  window.addEventListener(CHATS_CHANGED, listener);
  return () => window.removeEventListener(CHATS_CHANGED, listener);
}
