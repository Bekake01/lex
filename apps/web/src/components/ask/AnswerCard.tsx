'use client';

import { useState, type ReactNode } from 'react';
import type { CitationWire, LegalAnswerWire, LegalContactKind } from '@lex/contracts';
import {
  AlertIcon,
  BuildingIcon,
  CheckIcon,
  CopyIcon,
  ExternalIcon,
  HeartPulseIcon,
  PhoneIcon,
  ScaleIcon,
  ShieldIcon,
  UserIcon,
} from '../Icons';

const contactIcon: Record<LegalContactKind, { Icon: typeof ShieldIcon; tone: string }> = {
  police: { Icon: ShieldIcon, tone: 'bg-info-soft text-info' },
  medical: { Icon: HeartPulseIcon, tone: 'bg-danger-soft text-danger' },
  court: { Icon: ScaleIcon, tone: 'bg-warning-soft text-warning' },
  lawyer: { Icon: UserIcon, tone: 'bg-violet-soft text-violet' },
  gov: { Icon: BuildingIcon, tone: 'bg-success-soft text-success' },
};

export function AnswerCard({ answer: a, onFollowUp }: { answer: LegalAnswerWire; onFollowUp: (q: string) => void }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {a.urgent && (
        <div className="flex flex-col gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 sm:flex-row sm:items-center">
          {/* On a phone the numbers get their own row: side by side they squeezed
              the warning down to one word per line. */}
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger sm:mt-0" />
            <p className="min-w-0 flex-1 text-sm text-danger">{a.urgent.text}</p>
          </div>
          <div className="flex flex-wrap gap-2 pl-8 sm:shrink-0 sm:pl-0">
            {a.urgent.numbers.map((n) => (
              <a
                key={n.number}
                href={`tel:${n.number}`}
                className="btn btn-danger btn-sm font-semibold"
              >
                <PhoneIcon className="size-3.5" />
                {n.number}
                <span className="font-normal opacity-80">{n.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">{a.topic}</span>
        <p className="mt-3 text-[16px] leading-relaxed">{a.summary}</p>
      </div>

      {a.consequences.length > 0 && (
        <Section title="Qonun böyiça nima böladi">
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {a.consequences.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.title}</div>
                  <div className="text-sm text-ink/75">{c.text}</div>
                </div>
                {c.citation && (
                  <a
                    href={c.citation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={c.citation.actTitle}
                    className="inline-flex max-w-full shrink-0 items-center gap-1.5 self-start rounded-lg border border-line bg-page px-2 py-1 text-xs hover:border-accent/40 hover:text-accent sm:max-w-[45%]"
                  >
                    <ScaleIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{citationLabel(c.citation)}</span>
                    <ExternalIcon className="size-3 shrink-0" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {a.steps.length > 0 && (
        <Section title="Hozir nima qiliş kerak">
          <ol className="flex flex-col gap-2">
            {a.steps.map((s, i) => {
              const checked = done.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() =>
                      setDone((d) => {
                        const n = new Set(d);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm transition hover:border-line-strong"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
                        checked ? 'bg-success text-on-color' : 'bg-subtle text-ink/70'
                      }`}
                    >
                      {checked ? <CheckIcon className="size-3.5" /> : i + 1}
                    </span>
                    <span className={`pt-0.5 leading-relaxed ${checked ? 'text-muted line-through' : ''}`}>{s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {a.template && (
        <Section title={a.template.title}>
          <div className="relative rounded-xl border border-line bg-surface">
            <button
              onClick={() => {
                navigator.clipboard.writeText(a.template!.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-line bg-page px-2 py-1 text-xs hover:bg-subtle"
            >
              {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
              {copied ? 'Nusxalandi' : 'Nusxalaş'}
            </button>
            <pre className="overflow-x-auto p-4 pt-10 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink/85">
              {a.template.text}
            </pre>
          </div>
        </Section>
      )}

      {a.contacts.length > 0 && (
        <Section title="Qayerga murojaat qiliş">
          <div className="grid gap-2 sm:grid-cols-2">
            {a.contacts.map((c, i) => {
              const { Icon, tone } = contactIcon[c.kind];
              const body = (
                <>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">{c.detail}</span>
                  </span>
                  {c.phone && (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-ink px-2 py-1 font-mono text-sm font-semibold text-page">
                      <PhoneIcon className="size-3" />
                      {c.phone}
                    </span>
                  )}
                </>
              );
              const cls = 'flex items-center gap-3 rounded-xl border border-line bg-surface p-3';
              return c.phone ? (
                <a key={i} href={`tel:${c.phone}`} className={`${cls} transition hover:border-line-strong`}>
                  {body}
                </a>
              ) : (
                <div key={i} className={cls}>
                  {body}
                </div>
              );
            })}
          </div>
        </Section>
      )}


      {a.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.followUps.map((q) => (
            <button
              key={q}
              onClick={() => onFollowUp(q)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink/75 hover:border-accent/40 hover:text-accent"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Mehnat kodeksi, 72-modda": the act's short name and the article. */
function citationLabel(c: CitationWire): string {
  const act = c.actTitle.replace(/^O[ʻ'‘`]?zbekiston Respublikasining\s+/i, '');
  return c.articleNumber ? `${act}, ${c.articleNumber}-modda` : act;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
