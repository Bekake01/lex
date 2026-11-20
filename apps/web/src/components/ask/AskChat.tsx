'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Briefcase, FileText, HandCoins, ShieldAlert } from 'lucide-react';
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

// Topic tiles on the empty screen: each asks one example question.
const TOPICS = [
  { title: 'Jismoniy zarar', q: 'Meni kimdir urib ketdi, nima qilişim kerak?', Icon: ShieldAlert, tone: 'bg-red-50 text-red-500' },
  { title: 'Mehnat', q: 'Iş beruvçi 2 oydan beri maoş bermayapti', Icon: Briefcase, tone: 'bg-sky-50 text-sky-600' },
  { title: 'Zararni undiriş', q: 'Maʼnaviy zararni undirsa böladimi?', Icon: HandCoins, tone: 'bg-amber-50 text-amber-600' },
  { title: 'Ariza namunasi', q: 'Ariza qanday yoziladi?', Icon: FileText, tone: 'bg-emerald-50 text-emerald-600' },
];

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
          {empty && (
            <div className="animate-fade-up pt-8 pb-4 text-center sm:pt-14">
              <h1 className="mx-auto max-w-xl text-[2.6rem] leading-[1.1] font-medium tracking-tight sm:text-[3.4rem]">
                Qanday{' '}
                <span className="relative whitespace-nowrap text-accent">
                  muammo
                  <svg viewBox="0 0 220 14" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-3 w-full" aria-hidden>
                    <path d="M3 9.5C45 3 120 2 217 7.5" fill="none" stroke="#ff7f66" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </span>{' '}
                böldi?
              </h1>
              <p className="mx-auto mt-5 max-w-md text-lg text-ink/70">
                Vaziyatni öz sözlaringiz bilan yozing — nima qiliş va qayerga borişni qonun bilan tuşuntiramiz.
              </p>
              <div className="mx-auto mt-10 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
                {TOPICS.map(({ title, q, Icon, tone }) => (
                  <button
                    key={title}
                    onClick={() => ask(q)}
                    className="group flex items-start gap-3.5 rounded-2xl bg-white/80 p-4 ring-1 ring-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_30px_rgb(0_31_41/0.08)]"
                  >
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{title}</span>
                      <span className="block text-sm text-muted group-hover:text-ink/80">{q}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex animate-fade-up justify-end">
                <div className="max-w-[85%] rounded-2xl bg-sand px-4 py-2.5 text-[15px]">{m.text}</div>
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
                <Link
                  href="/contracts"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-dark"
                >
                  <FileIcon className="size-4" /> Şartnomalar
                </Link>
              </Row>
            ),
          )}

          {busy && (
            <Row>
              <ol className="flex flex-col gap-2 text-sm">
                {STEPS.map((s, i) => (
                  <li key={s} className={`flex items-center gap-2.5 ${i > step! ? 'text-slate-400' : 'text-muted'}`}>
                    {i < step! ? (
                      <CheckIcon className="size-4 text-emerald-600" />
                    ) : i === step ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
                    ) : (
                      <span className="size-4 rounded-full border border-dashed border-slate-300" />
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

      <div className="shrink-0 px-4 pb-1">
        <div className="halo mx-auto max-w-2xl !rounded-2xl !p-1.5">
        <div className="flex items-end gap-2 rounded-xl bg-white p-2 pl-4 ring-accent/30 focus-within:ring-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Vaziyatingizni yozing yoki savol bering…"
            className="block max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-slate-400"
          />
          <button
            onClick={() => ask(input)}
            disabled={!input.trim() || busy}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-white transition hover:bg-accent-dark disabled:opacity-30"
            aria-label="Yuboriş"
          >
            <ArrowUpIcon className="size-4" />
          </button>
        </div>
        </div>
      </div>
      <Disclaimer />
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
