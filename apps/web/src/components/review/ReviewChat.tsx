'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReviewMessageWire } from '@lex/contracts';
import { errorText, getMessages, messagesSettled, poll, sendMessage } from '@/lib/review';
import { ArrowUpIcon, LogoMark } from '../Icons';
import { AcceptAll, EditCard, type EditDecisions } from './ReviewEdits';

const QUICK = ['Eng katta xavf nima?', 'Hammasiga taklif tayyorla'];

/**
 * The correction chat of one review (`GET/POST /reviews/:id/messages`).
 * Loads the history, and polls while an answer is still `pending`, so a
 * reload in the middle of an answer picks it up again.
 */
export function useReviewChat(reviewId: string | null) {
  const [messages, setMessages] = useState<ReviewMessageWire[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const stopPoll = useRef<(() => void) | undefined>(undefined);

  const follow = useCallback(() => {
    stopPoll.current?.();
    if (!reviewId) return;
    stopPoll.current = poll(
      () => getMessages(reviewId),
      messagesSettled,
      (ms) => {
        setMessages(ms);
        setLoaded(true);
      },
      (err) => {
        setLoaded(true);
        setError(errorText(err, 'Suhbatni olib bölmadi.'));
      },
    );
  }, [reviewId]);

  useEffect(() => {
    setMessages([]);
    setLoaded(false);
    setError('');
    follow();
    return () => stopPoll.current?.();
  }, [follow]);

  const pending = messages.some((m) => m.status === 'pending');

  /** Sends a message; resolves false (and keeps the text for the composer) when it failed. */
  async function send(text: string): Promise<boolean> {
    const t = text.trim();
    if (!t || !reviewId || sending || pending) return false;
    setSending(true);
    setError('');
    const now = new Date().toISOString();
    // Shown at once; the next poll replaces them with the stored rows.
    setMessages((ms) => [
      ...ms,
      { id: 'local-user', role: 'user', text: t, status: 'done', edits: [], createdAt: now },
      { id: 'local-ai', role: 'assistant', text: '', status: 'pending', edits: [], createdAt: now },
    ]);
    try {
      await sendMessage(reviewId, t);
      follow();
      return true;
    } catch (err) {
      setMessages((ms) => ms.filter((m) => !m.id.startsWith('local-')));
      setError(errorText(err, 'Xabarni yuborib bölmadi. Qayta urinib köring.'));
      return false;
    } finally {
      setSending(false);
    }
  }

  return { messages, loaded, error, busy: sending || pending, send, refresh: follow };
}

export type ReviewChatState = ReturnType<typeof useReviewChat>;

/** The messages, under the findings card in the same scroll. */
export function ChatMessages({ chat, decisions }: { chat: ReviewChatState; decisions: EditDecisions }) {
  const end = useRef<HTMLDivElement>(null);
  const count = chat.messages.length;
  const last = chat.messages[count - 1];

  useEffect(() => {
    if (count) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count, last?.status]);

  return (
    <>
      {chat.messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex animate-fade-up justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-subtle px-4 py-2.5 text-[15px]">{m.text}</div>
          </div>
        ) : (
          <div key={m.id} className="flex animate-fade-up gap-3">
            <LogoMark className="mt-0.5 size-7 shrink-0 text-sm" />
            <div className="min-w-0 flex-1">
              <Answer message={m} decisions={decisions} />
            </div>
          </div>
        ),
      )}
      <div ref={end} />
    </>
  );
}

function Answer({ message, decisions }: { message: ReviewMessageWire; decisions: EditDecisions }) {
  if (message.status === 'pending') {
    return (
      <div className="flex items-center gap-1.5 py-2" aria-label="Javob yozilmoqda">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-2 animate-bounce rounded-full bg-accent/50" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    );
  }
  if (message.status === 'failed') {
    return (
      <p className="text-sm text-muted">Javob tayyorlab bölmadi. Savolni qayta yuborib köring.</p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {message.text && <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.text}</p>}
      {message.edits.map((e) => (
        <EditCard key={e.id} edit={e} decisions={decisions} />
      ))}
      <AcceptAll edits={message.edits} decisions={decisions} />
    </div>
  );
}

/** The question box at the bottom, with quick questions while the chat is idle. */
export function ChatComposer({ chat }: { chat: ReviewChatState }) {
  const [input, setInput] = useState('');

  async function submit(text: string) {
    const keep = input;
    if (text === input) setInput('');
    const ok = await chat.send(text);
    if (!ok && text === keep) setInput(keep);
  }

  return (
    <div className="shrink-0 px-4 pb-4">
      <div className="mx-auto max-w-2xl">
        {chat.loaded && !chat.busy && chat.messages.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => void submit(q)}
                className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink/75 hover:border-accent/40 hover:text-accent"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {chat.error && (
          <p role="alert" className="mb-2 text-sm text-danger">
            {chat.error}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-sm focus-within:border-accent/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            rows={1}
            maxLength={4000}
            aria-label="Şartnoma haqida savol"
            placeholder={chat.busy ? 'Javob yozilmoqda…' : 'Şartnoma haqida sörang yoki tuzatiş sörang'}
            className="block max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-faint"
          />
          <button
            onClick={() => void submit(input)}
            disabled={!input.trim() || chat.busy}
            className="btn btn-primary btn-icon btn-sm"
            aria-label="Yuboriş"
          >
            <ArrowUpIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
