'use client';

import { useState, type ReactNode } from 'react';
import type { ContactKind, LegalAnswer } from '@/lib/legalQa';
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

const contactIcon: Record<ContactKind, { Icon: typeof ShieldIcon; tone: string }> = {
  police: { Icon: ShieldIcon, tone: 'bg-sky-50 text-sky-700' },
  medical: { Icon: HeartPulseIcon, tone: 'bg-red-50 text-red-600' },
  court: { Icon: ScaleIcon, tone: 'bg-amber-50 text-amber-700' },
  lawyer: { Icon: UserIcon, tone: 'bg-violet-50 text-violet-700' },
  gov: { Icon: BuildingIcon, tone: 'bg-emerald-50 text-emerald-700' },
};

export function AnswerCard({ answer: a, onFollowUp }: { answer: LegalAnswer; onFollowUp: (q: string) => void }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {a.urgent && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertIcon className="size-5 shrink-0 text-red-600" />
          <p className="min-w-0 flex-1 text-sm text-red-900">{a.urgent.text}</p>
          <div className="flex gap-2">
            {a.urgent.numbers.map((n) => (
              <a
                key={n.number}
                href={`tel:${n.number}`}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
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

      {a.consequences && (
        <Section title="Qonun böyiça nima böladi">
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {a.consequences.map((c) => (
              <div key={c.title} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.title}</div>
                  <div className="text-sm text-ink/75">{c.text}</div>
                </div>
                <a
                  href={c.citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-line bg-cream px-2 py-1 text-xs hover:border-accent/40 hover:text-accent"
                >
                  <ScaleIcon className="size-3.5" />
                  {c.citation.law.replace(' töğrisidagi kodeks', '')}, {c.citation.article}
                  <ExternalIcon className="size-3" />
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}

      {a.steps && (
        <Section title="Hozir nima qiliş kerak">
          <ol className="flex flex-col gap-2">
            {a.steps.map((s, i) => {
              const checked = done.has(i);
              return (
                <li key={s}>
                  <button
                    onClick={() =>
                      setDone((d) => {
                        const n = new Set(d);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className="flex w-full items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left text-sm transition hover:border-slate-300"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
                        checked ? 'bg-emerald-500 text-white' : 'bg-sand text-ink/70'
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
          <div className="relative rounded-xl border border-line bg-white">
            <button
              onClick={() => {
                navigator.clipboard.writeText(a.template!.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-line bg-cream px-2 py-1 text-xs hover:bg-sand"
            >
              {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
              {copied ? 'Nusxalandi' : 'Nusxalaş'}
            </button>
            <pre className="overflow-x-auto p-4 pt-10 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink/85">
              {a.template.text}
            </pre>
          </div>
        </Section>
      )}

      {a.contacts && (
        <Section title="Qayerga murojaat qiliş">
          <div className="grid gap-2 sm:grid-cols-2">
            {a.contacts.map((c) => {
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
                    <span className="flex items-center gap-1 rounded-md bg-ink px-2 py-1 font-mono text-sm font-semibold text-cream">
                      <PhoneIcon className="size-3" />
                      {c.phone}
                    </span>
                  )}
                </>
              );
              const cls = 'flex items-center gap-3 rounded-xl border border-line bg-white p-3';
              return c.phone ? (
                <a key={c.name} href={`tel:${c.phone}`} className={`${cls} transition hover:border-slate-300`}>
                  {body}
                </a>
              ) : (
                <div key={c.name} className={cls}>
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
              className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink/75 hover:border-accent/40 hover:text-accent"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
