'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toNewAlphabet } from '@/lib/alphabet';
import { contract, review, severityMeta, type Issue } from '@/lib/demo';
import { ArrowUpIcon, CheckIcon, FileIcon, LogoMark, PenIcon, SendIcon, XIcon } from '../Icons';
import { DocumentPane } from './DocumentPane';
import { ReviewCard } from './ReviewCard';
import { SignDialog } from './SignDialog';

// The contract was sent to this user (it comes from the backend). They review it with AI,
// collect change suggestions for the sender, and either sign or ask for changes.

type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; kind: 'review' }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | { id: string; role: 'assistant'; kind: 'edit'; issueId: string; status: 'pending' | 'accepted' | 'rejected' };

type Status = 'open' | 'signed' | 'changes';

const STEPS = [
  'Hujjat matni öqilmoqda',
  'Rasmiy qonunlardan tegişli moddalar qidirilmoqda',
  'Bandlar qonunçilik bilan soliştirilmoqda',
];

const QUICK = ['Eng katta xavf nima?', '4-band uçun taklif tayyorla', 'Hammasiga taklif tayyorla'];

let seq = 0;
const uid = () => `m${++seq}`;
const clauseNo = (clauseId: string) => contract.clauses.find((c) => c.id === clauseId)?.number ?? 0;
const issueById = (id: string) => review.issues.find((i) => i.id === id) as Issue;

export function ReviewWorkspace() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [step, setStep] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [suggested, setSuggested] = useState<Set<string>>(new Set()); // issue ids
  const [selected, setSelected] = useState<string | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [status, setStatus] = useState<Status>('open');
  const [input, setInput] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);

  const analyzing = step < STEPS.length;
  const openHigh = review.issues.filter((i) => i.severity === 'high' && !suggested.has(i.id)).length;

  // Fake the analysis pipeline, then show the review.
  useEffect(() => {
    if (!analyzing) return;
    const t = setTimeout(() => {
      const next = step + 1;
      setStep(next);
      if (next === STEPS.length) setMessages((m) => [...m, { id: 'review', role: 'assistant', kind: 'review' }]);
    }, 800);
    return () => clearTimeout(t);
  }, [step, analyzing]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking, step]);

  function say(text: string) {
    setMessages((m) => [...m, { id: uid(), role: 'assistant', kind: 'text', text }]);
  }

  function openIssues() {
    const busy = new Set(
      messages.flatMap((m) => (m.role === 'assistant' && m.kind === 'edit' && m.status !== 'rejected' ? [m.issueId] : [])),
    );
    return review.issues.filter((i) => !suggested.has(i.id) && !busy.has(i.id));
  }

  function send(raw: string) {
    const text = raw.trim();
    if (!text || thinking || analyzing) return;
    setInput('');
    setMessages((m) => [...m, { id: uid(), role: 'user', text }]);
    setThinking(true);

    const open = openIssues();
    const fixable = open.filter((i) => i.fix);
    const num = Number(text.match(/(\d+)\s*-?\s*band/i)?.[1]);
    const norm = toNewAlphabet(text); // user may type in the old alphabet
    const wantsAll = /hammasi|barça|hamma/i.test(norm);
    const wantsFix = /taklif|tuzat|özgartir|tahrir/i.test(norm);

    let reply: Msg[];
    if (num) {
      const target = fixable.find((i) => clauseNo(i.clauseId) === num);
      reply = target
        ? [{ id: uid(), role: 'assistant', kind: 'edit', issueId: target.id, status: 'pending' }]
        : [{ id: uid(), role: 'assistant', kind: 'text', text: `${num}-bandda oçiq muammo yöq.` }];
    } else if (wantsFix && fixable.length > 0) {
      const targets = wantsAll ? fixable : fixable.slice(0, 1);
      reply = targets.map((i) => ({ id: uid(), role: 'assistant', kind: 'edit', issueId: i.id, status: 'pending' }) as Msg);
    } else if (open.length === 0) {
      reply = [{ id: uid(), role: 'assistant', kind: 'text', text: 'Barça muammolar körib çiqildi. Endi imzolaşingiz yoki özgartiriş söraşingiz mumkin.' }];
    } else {
      const top = [...open].sort((a, b) => severityMeta[b.severity].weight - severityMeta[a.severity].weight)[0];
      reply = [{
        id: uid(),
        role: 'assistant',
        kind: 'text',
        text: `Eng muhimi — ${clauseNo(top.clauseId)}-band: “${top.title}”. ${top.problem}`,
      }];
    }

    const firstEdit = reply.find((m) => m.role === 'assistant' && m.kind === 'edit');
    setTimeout(() => {
      setThinking(false);
      setMessages((m) => [...m, ...reply]);
      if (firstEdit && firstEdit.role === 'assistant' && firstEdit.kind === 'edit') setSelected(firstEdit.issueId);
    }, 1200);
  }

  function decide(msgId: string, issue: Issue, accept: boolean) {
    setMessages((m) =>
      m.map((x) => (x.id === msgId && x.role === 'assistant' && x.kind === 'edit' ? { ...x, status: accept ? 'accepted' : 'rejected' } : x)),
    );
    if (!accept) return;
    setSuggested((s) => new Set(s).add(issue.id));
    setSelected(issue.id);
  }

  function requestChanges() {
    // TODO: POST suggestions to apps/api → notify the sender.
    setStatus('changes');
    say(`${suggested.size} ta özgartiriş taklifi ${contract.sender}ga yuborildi. Javob kelganda şu yerda körasiz.`);
  }

  function onSigned() {
    // TODO: POST signature to apps/api → complete-signature job.
    setSignOpen(false);
    setStatus('signed');
    say('Şartnoma imzolandi. Muhrlangan nusxa va sertifikat ikkala tomonga yuboriladi.');
  }

  return (
    <div className="halo mx-3 mt-3 mb-3 flex min-h-0 flex-1 flex-col !p-1.5 sm:mx-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.1rem] bg-white">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-medium tracking-tight">{contract.title}</h1>
          <div className="text-xs text-muted">
            {contract.sender} · {contract.receivedAt}
          </div>
        </div>
        <button
          onClick={() => setDocOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-sand lg:hidden"
        >
          <FileIcon className="size-4" /> Hujjat
        </button>
        {status === 'open' ? (
          <>
            {suggested.size > 0 && (
              <button
                onClick={requestChanges}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-accent/40 px-4 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                <SendIcon className="size-4" />
                <span className="hidden sm:inline">Özgartiriş söraş</span>
                <span className="rounded-full bg-coral px-1.5 text-[11px] font-bold text-navy">{suggested.size}</span>
              </button>
            )}
            <button
              onClick={() => setSignOpen(true)}
              disabled={analyzing}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:opacity-40"
            >
              <PenIcon className="size-4" /> Imzolaş
            </button>
          </>
        ) : (
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
              status === 'signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {status === 'signed' ? <CheckIcon className="size-4" /> : <SendIcon className="size-4" />}
            {status === 'signed' ? 'Imzolangan' : 'Özgartiriş söralgan'}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex animate-fade-up justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-sand px-4 py-2.5 text-[15px]">{m.text}</div>
                  </div>
                ) : (
                  <AssistantRow key={m.id}>
                    {m.kind === 'review' && (
                      <ReviewCard suggested={suggested} selected={selected} onSelect={setSelected} />
                    )}
                    {m.kind === 'text' && <p className="text-[15px] leading-relaxed">{m.text}</p>}
                    {m.kind === 'edit' && (
                      <EditCard
                        issue={issueById(m.issueId)}
                        original={contract.clauses.find((c) => c.id === issueById(m.issueId).clauseId)!.text}
                        status={m.status}
                        onDecide={(ok) => decide(m.id, issueById(m.issueId), ok)}
                        onFocus={() => setSelected(m.issueId)}
                      />
                    )}
                  </AssistantRow>
                ),
              )}

              {analyzing && (
                <AssistantRow>
                  <ol className="flex flex-col gap-2 text-sm">
                    {STEPS.map((s, i) => (
                      <li key={s} className={`flex items-center gap-2.5 ${i > step ? 'text-slate-400' : 'text-muted'}`}>
                        {i < step ? (
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
                </AssistantRow>
              )}

              {thinking && (
                <AssistantRow>
                  <div className="flex items-center gap-1.5 py-2">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="size-2 animate-bounce rounded-full bg-accent/50" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </AssistantRow>
              )}
              <div ref={chatEnd} />
            </div>
          </div>

          <div className="shrink-0 px-4 pb-4">
            <div className="mx-auto max-w-2xl">
              {!analyzing && !thinking && status === 'open' && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink/75 hover:border-accent/40 hover:text-accent"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-sm focus-within:border-accent/40">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  disabled={analyzing}
                  placeholder={analyzing ? 'Tahlil qilinmoqda…' : 'Şartnoma haqida sörang'}
                  className="block max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || thinking || analyzing}
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white transition hover:bg-accent-dark disabled:opacity-30"
                  aria-label="Yuboriş"
                >
                  <ArrowUpIcon className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <DocumentPane
          suggested={suggested}
          selected={selected}
          onSelect={setSelected}
          open={docOpen}
          onClose={() => setDocOpen(false)}
          dimmed={analyzing}
        />
      </div>

      </div>
      {signOpen && <SignDialog openHigh={openHigh} onClose={() => setSignOpen(false)} onSigned={onSigned} />}
    </div>
  );
}

function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-fade-up gap-3">
      <LogoMark className="mt-0.5 size-7 shrink-0 text-sm" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function EditCard({
  issue,
  original,
  status,
  onDecide,
  onFocus,
}: {
  issue: Issue;
  original: string;
  status: 'pending' | 'accepted' | 'rejected';
  onDecide: (accept: boolean) => void;
  onFocus: () => void;
}) {
  const n = clauseNo(issue.clauseId);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white" onMouseEnter={onFocus}>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-cream px-4 py-2 text-xs">
        <span className="font-semibold">{n}-band uçun taklif</span>
        <span className="truncate text-muted">
          {issue.citation.law}, {issue.citation.article}
        </span>
      </div>
      <div className="space-y-2 p-4 font-doc text-[15px] leading-relaxed">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900/80 line-through decoration-red-400/70">{original}</p>
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-950">{issue.fix?.replacement}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <span className="text-xs text-muted">{issue.fix?.reason}</span>
        {status === 'pending' ? (
          <div className="flex gap-2">
            <button
              onClick={() => onDecide(false)}
              className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-sand"
            >
              <XIcon className="size-3.5" /> Kerak emas
            </button>
            <button
              onClick={() => onDecide(true)}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
            >
              <CheckIcon className="size-3.5" /> Taklifga qöşiş
            </button>
          </div>
        ) : (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {status === 'accepted' ? 'Taklifga qöşildi' : 'Qöşilmadi'}
          </span>
        )}
      </div>
    </div>
  );
}
