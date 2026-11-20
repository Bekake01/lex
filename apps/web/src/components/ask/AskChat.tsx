'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toNewAlphabet } from '@/lib/alphabet';
import { answerFor, type LegalAnswer } from '@/lib/legalQa';
import { ArrowUpIcon, CheckIcon, FileIcon, LogoMark, ScaleIcon } from '../Icons';
import { Disclaimer } from '../Disclaimer';
import { AnswerCard } from './AnswerCard';

type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; answer: LegalAnswer }
  | { id: string; role: 'assistant'; contractHint: true };

const STEPS = ['Vaziyat tahlil qilinmoqda', 'Rasmiy qonunlardan tegişli moddalar qidirilmoqda', 'Javob tayyorlanmoqda'];

let seq = 0;
const uid = () => `q${++seq}`;

export function AskChat() {
  const initial = useSearchParams().get('q')?.trim() ?? '';
  const [messages, setMessages] = useState<Msg[]>([]);
  const [step, setStep] = useState<number | null>(null); // null = idle
  const [input, setInput] = useState('');
  const pending = useRef<Msg | null>(null);
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const busy = step !== null;

  function ask(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: uid(), role: 'user', text }]);
    // TODO: POST to apps/api (legal Q&A with law-search) and stream the answer.
    const norm = toNewAlphabet(text);
    pending.current = /şartnoma/i.test(norm) && /tekşir|körib/i.test(norm)
      ? { id: uid(), role: 'assistant', contractHint: true }
      : { id: uid(), role: 'assistant', answer: answerFor(text) };
    setStep(0);
  }

  // Ask the question passed from the home page once.
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Fake "thinking" steps, then reveal the answer.
  useEffect(() => {
    if (step === null) return;
    const t = setTimeout(() => {
      if (step + 1 < STEPS.length) return setStep(step + 1);
      const msg = pending.current;
      pending.current = null;
      setStep(null);
      if (msg) setMessages((m) => [...m, msg]);
    }, 700);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, step]);

  const empty = messages.length === 0 && !busy;
  const firstQuestion = messages.find((m): m is Extract<Msg, { role: 'user' }> => m.role === 'user')?.text;

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
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[8vh]">
          <div className="w-full max-w-2xl animate-fade-up">
            <h1 className="mb-7 flex items-center justify-center gap-3 text-center text-3xl font-medium tracking-tight sm:text-4xl">
              <LogoMark className="size-9 sm:size-10" />
              Qanday muammo böldi?
            </h1>
            {composer}
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
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex animate-fade-up justify-end">
                <div className="max-w-[85%] rounded-2xl bg-subtle px-4 py-2.5 text-[15px]">{m.text}</div>
              </div>
            ) : 'answer' in m ? (
              <Row key={m.id}>
                <AnswerCard answer={m.answer} onFollowUp={ask} />
              </Row>
            ) : (
              <Row key={m.id}>
                <p className="text-[15px] leading-relaxed">
                  Sizga kelgan şartnomalar “Şartnomalar” bölimida — oçsangiz, AI tekşiruvi avtomatik boşlanadi.
                </p>
                <Link href="/contracts" className="btn btn-primary btn-sm mt-3">
                  <FileIcon className="size-4" /> Şartnomalar
                </Link>
              </Row>
            ),
          )}

          {busy && (
            <Row>
              <ol className="flex flex-col gap-2 text-sm">
                {STEPS.map((s, i) => (
                  <li key={s} className={`flex items-center gap-2.5 ${i > step! ? 'text-faint' : 'text-muted'}`}>
                    {i < step! ? (
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
    <div className="halo !rounded-[1.4rem] !p-1.5">
      <div className="flex flex-col rounded-2xl bg-surface ring-accent/30 transition focus-within:ring-2">
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
          rows={large ? 3 : 1}
          placeholder="Vaziyatingizni yozing yoki savol bering…"
          className={`block max-h-48 w-full resize-none bg-transparent px-4 text-[15px] outline-none placeholder:text-faint ${
            large ? 'pt-4' : 'pt-3'
          }`}
        />
        <div className="flex justify-end p-2 pt-0">
          <button
            onClick={onSend}
            disabled={!value.trim() || disabled}
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

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-fade-up gap-3">
      <LogoMark className="mt-0.5 size-7 shrink-0 text-sm" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A new ?q= (recent chat) or ?n= (new chat) starts a fresh conversation. */
export function AskChatRoute() {
  const params = useSearchParams();
  return <AskChat key={`${params.get('q') ?? ''}|${params.get('n') ?? ''}`} />;
}
