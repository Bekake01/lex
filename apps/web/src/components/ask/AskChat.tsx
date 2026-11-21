'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LegalChatMessageWire, LegalChatWire } from '@lex/contracts';
import { askQuestion, chatSettled, getChat } from '@/lib/legal-qa';
import { errorText, poll, uploadErrorText, uploadForReview } from '@/lib/review';
import { UPLOAD_ACCEPT, uploadError } from '@/lib/upload';
import { ArrowUpIcon, CheckIcon, FileIcon, LogoMark, ScaleIcon, UploadIcon } from '../Icons';
import { Disclaimer } from '../Disclaimer';
import { AnswerCard } from './AnswerCard';

// What the answer job does, in order. The job reports no progress, so the
// steps advance on a timer and the last one spins until the answer is in.
const STEPS = ['Savol tahlil qilinmoqda', 'Rasmiy qonunlardan tegişli moddalar qidirilmoqda', 'Javob yozilmoqda'];
const STEP_MS = 5000;

export function AskChat() {
  const params = useSearchParams();
  const chatParam = params.get('chat');
  const initial = params.get('q')?.trim() ?? '';
  const [chat, setChat] = useState<LegalChatWire | null>(null);
  const [loading, setLoading] = useState(chatParam !== null);
  const [sending, setSending] = useState(false);
  const [askError, setAskError] = useState('');
  const [step, setStep] = useState(0);
  const [pollRound, setPollRound] = useState(0);
  const [input, setInput] = useState('');
  /** The question on its way, shown until the chat has it. */
  const [asked, setAsked] = useState('');
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const chatId = chat?.id ?? chatParam;
  const waiting = chat !== null && !chatSettled(chat);
  const busy = sending || waiting;

  // An open chat (?chat=): load it, and poll while an answer is being written.
  useEffect(() => {
    if (!chatParam) return;
    return poll(
      () => getChat(chatParam),
      chatSettled,
      (c) => {
        setChat(c);
        setLoading(false);
      },
      (err) => {
        setAskError(errorText(err, 'Suhbatni oçib bölmadi.'));
        setLoading(false);
      },
    );
  }, [chatParam, pollRound]);

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setAsked(text);
    setAskError('');
    setStep(0);
    setSending(true);
    try {
      const res = await askQuestion(chatId, text);
      if (!chatId) {
        // A new chat gets its own URL, so a reload or the sidebar reopens it.
        // `sending` stays on: this view is replaced by the one for that URL.
        router.replace(`/ask?chat=${res.chatId}`);
        return;
      }
      // Poll again now that a new answer is pending.
      setChat(await getChat(chatId));
      setPollRound((n) => n + 1);
      setAsked('');
      setSending(false);
    } catch (err) {
      setAsked('');
      setInput(text);
      setAskError(errorText(err, 'Savolni yuborib bölmadi. Qayta urinib köring.'));
      setSending(false);
    }
  }

  // Ask the question passed from the home page once.
  useEffect(() => {
    if (initial && !chatParam && !started.current) {
      started.current = true;
      void ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // The waiting steps.
  useEffect(() => {
    if (!busy || step + 1 >= STEPS.length) return;
    const t = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [busy, step]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, busy]);

  const pickFile = () => fileInput.current?.click();

  /** Uploads the contract (`POST /documents`), then opens its AI review. */
  async function openFile(file: File | undefined) {
    if (!file || uploading) return;
    const error = uploadError(file);
    setFileError(error ?? '');
    if (error) return;
    setUploading(true);
    try {
      const doc = await uploadForReview(file);
      // `uploading` stays on while the page changes, so it can't be sent twice.
      router.push(`/review?doc=${doc.id}`);
    } catch (err) {
      setFileError(uploadErrorText(err));
      setUploading(false);
    }
  }

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept={UPLOAD_ACCEPT}
      hidden
      onChange={(e) => {
        void openFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  if (loading) return <div className="flex-1" />;

  const messages = chat?.messages ?? [];
  const empty = messages.length === 0 && !busy;
  const firstQuestion = messages.find((m) => m.role === 'user')?.text ?? (asked || undefined);

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSend={() => ask(input)}
      disabled={busy}
      large={empty}
    />
  );

  // Empty screen: greeting + input in the middle of the page, like a fresh chat.
  if (empty) {
    return (
      // data-new-chat: the sidebar's "Yangi suhbat" sees we are already on a fresh chat.
      <div
        data-new-chat
        className="flex h-full min-h-0 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void openFile(e.dataTransfer.files[0]);
        }}
      >
        {fileField}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[8vh]">
          <div className="w-full max-w-2xl animate-fade-up">
            <h1 className="mb-6 flex items-center justify-center gap-2.5 text-center text-[1.75rem] font-medium tracking-tight sm:text-[2rem]">
              <LogoMark className="size-8" />
              Qanday yordam bera olaman?
            </h1>
            {composer}
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading}
              className={`mx-auto mt-4 flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                dragging ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface/50 text-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
              }`}
            >
              <UploadIcon className="size-4" />
              {uploading ? 'Yuklanmoqda…' : dragging ? 'Faylni qöyib yuboring' : 'Hujjat yuklaş'}
            </button>
            {fileError && <p className="mt-1 text-center text-[13px] text-danger">{fileError}</p>}
            {askError && <p className="mt-1 text-center text-[13px] text-danger">{askError}</p>}
          </div>
        </div>
        <Disclaimer />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {firstQuestion && (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <ScaleIcon className="size-4" />
            <span className="truncate">{firstQuestion}</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
          {messages.map((m) => (
            <Message key={m.id} message={m} onFollowUp={(q) => void ask(q)} />
          ))}
          {asked && (
            <div className="flex animate-fade-up justify-end">
              <div className="max-w-[85%] rounded-2xl bg-subtle px-4 py-2.5 text-[15px] whitespace-pre-wrap">{asked}</div>
            </div>
          )}

          {busy && (
            <Row>
              <ol className="flex flex-col gap-2 text-sm">
                {STEPS.map((s, i) => (
                  <li key={s} className={`flex items-center gap-2.5 ${i > step ? 'text-faint' : 'text-muted'}`}>
                    {i < step ? (
                      <CheckIcon className="size-4 text-success" />
                    ) : i === step ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
                    ) : (
                      <span className="size-4 rounded-full border border-dashed border-line-strong" />
                    )}
                    {s}
                  </li>
                ))}
              </ol>
            </Row>
          )}
          {askError && <p className="text-sm text-danger">{askError}</p>}
          <div ref={end} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl shrink-0 px-4">{composer}</div>
      <Disclaimer />
    </div>
  );
}

/** Message box. `large` = the centered one on the empty screen (taller, auto-focused). */
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  large: boolean;
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-line bg-surface shadow-[0_4px_20px_var(--shadow)] transition focus-within:border-accent/50">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        autoFocus={large}
        rows={large ? 2 : 1}
        placeholder="Savolingizni shu yerga yozing…"
        className="block max-h-48 w-full resize-none bg-transparent px-5 pt-4 text-base outline-none placeholder:text-faint"
      />
      <div className="flex items-center justify-end px-3 pb-3">
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className="grid size-9 cursor-pointer place-items-center rounded-full bg-accent text-on-color transition hover:bg-accent-hover disabled:cursor-default disabled:bg-subtle disabled:text-faint"
          aria-label="Yuboriş"
          title="Yuboriş"
        >
          <ArrowUpIcon className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

function Message({ message: m, onFollowUp }: { message: LegalChatMessageWire; onFollowUp: (q: string) => void }) {
  if (m.role === 'user') {
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[85%] rounded-2xl bg-subtle px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.text}</div>
      </div>
    );
  }
  if (m.status === 'pending') return null;
  if (m.status === 'failed' || !m.answer) {
    return (
      <Row>
        <p className="text-[15px] text-danger">Javob tayyorlab bölmadi. Savolni qayta yuborib köring.</p>
      </Row>
    );
  }
  return (
    <Row>
      <AnswerCard answer={m.answer} onFollowUp={onFollowUp} />
      {m.answer.suggestContractReview && (
        <Link href="/contracts?view=files" className="btn btn-primary btn-sm mt-4">
          <FileIcon className="size-4" /> Şartnomani yuklaş
        </Link>
      )}
    </Row>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-fade-up gap-3">
      <LogoMark className="mt-0.5 size-7 shrink-0 text-sm" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A new ?chat= (recent chat), ?q= (question from home) or ?n= (new chat) starts afresh. */
export function AskChatRoute() {
  const params = useSearchParams();
  const key = ['chat', 'q', 'n'].map((k) => params.get(k) ?? '').join('|');
  return <AskChat key={key} />;
}
