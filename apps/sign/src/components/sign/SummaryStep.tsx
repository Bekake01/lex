import type {
  ObligationWire,
  RecipientSummaryWire,
  SummaryDeadlineWire,
  SummaryPointWire,
  SummaryWarningWire,
  SummaryWho,
} from '@lex/contracts';
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, ShieldIcon } from '../Icons';

/**
 * Step "Xulosa": the AI summary written at send time (`GET /sign/:token/summary`).
 * The five newer sections (`watchOut`, `youGet`, `youGive`, `deadlines`, `howToEnd`)
 * are optional: summaries written before 2026-11-21 don't have them, and then the
 * screen looks as it did. `flaggedIssues` is never shown (`watchOut` replaces it).
 * The AI text is shown exactly as it arrives.
 */
export function SummaryStep({ summary }: { summary: RecipientSummaryWire }) {
  const youGet = summary.youGet ?? [];
  const youGive = summary.youGive ?? [];
  const deadlines = summary.deadlines ?? [];
  const howToEnd = summary.howToEnd ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <Label>Qisqaça mazmuni</Label>
        <p className="mt-2 text-[17px] leading-relaxed">{summary.overview}</p>
        {summary.keyConditions.length > 0 && (
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {summary.keyConditions.map((t) => (
              <div key={t.label} className="rounded-xl bg-page px-4 py-3">
                <div className="text-xs text-muted">{t.label}</div>
                <div className="mt-0.5 font-medium">{t.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {summary.watchOut && <WatchOut items={summary.watchOut} />}

      {(youGet.length > 0 || youGive.length > 0) && (
        <div className={`grid gap-4 ${youGet.length > 0 && youGive.length > 0 ? 'sm:grid-cols-2' : ''}`}>
          {youGet.length > 0 && (
            <Card>
              <Heading dot="bg-success">Siz nima olasiz</Heading>
              <Points items={youGet} dot="bg-success" />
            </Card>
          )}
          {youGive.length > 0 && (
            <Card>
              <Heading dot="bg-accent">Siz nima berasiz</Heading>
              <Points items={youGive} dot="bg-accent" />
            </Card>
          )}
        </div>
      )}

      {deadlines.length > 0 && <Deadlines items={deadlines} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Heading dot="bg-accent">Sizning majburiyatlaringiz</Heading>
          <p className="mt-1 text-xs text-muted">{summary.partyName} sifatida</p>
          <Obligations items={summary.yourObligations} dot="bg-accent" />
        </Card>
        <Card>
          <Heading dot="bg-faint">Boşqa tomon majburiyatlari</Heading>
          <Obligations items={summary.otherObligations} dot="bg-faint" />
        </Card>
      </div>

      {howToEnd.length > 0 && (
        <Card>
          <Heading dot="bg-faint">Şartnomani qanday tugatiş mumkin</Heading>
          <Points items={howToEnd} dot="bg-faint" />
        </Card>
      )}

      <p className="flex gap-2 px-1 text-xs leading-relaxed text-muted">
        <ShieldIcon className="size-4 shrink-0" />
        Xulosa AI tomonidan yuboriş paytida tayyorlangan va özgarmaydi. Yuridik kuçga faqat hujjatning özi ega — uni
        keyingi qadamda töliq köring.
      </p>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_2px_12px_var(--shadow)] sm:p-6">{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-sm font-semibold">{children}</div>;
}

function Heading({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 shrink-0 rounded-full ${dot}`} />
      <Label>{children}</Label>
    </div>
  );
}

/** `"4.2"` → "4.2-band"; anything else (e.g. "7-modda") as is; `""` → no tag. */
function ClauseTag({ clauseRef }: { clauseRef: string }) {
  const ref = clauseRef.trim();
  if (!ref) return null;
  return (
    <span className="ml-1.5 inline-block rounded-md bg-subtle px-1.5 align-[1px] text-[11px] leading-[18px] whitespace-nowrap text-muted">
      {/^\d+(\.\d+)*$/.test(ref) ? `${ref}-band` : ref}
    </span>
  );
}

const SEVERITY: Record<SummaryWarningWire['severity'], { label: string; className: string }> = {
  high: { label: 'Jiddiy', className: 'border-danger-line bg-danger-soft text-danger' },
  medium: { label: 'Örtaça', className: 'border-warning-line bg-warning-soft text-warning' },
  low: { label: 'Past', className: 'border-info-line bg-info-soft text-info' },
};

/** "Ehtiyot böling": shown when the field exists; an empty list means nothing stood out. */
function WatchOut({ items }: { items: SummaryWarningWire[] }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <AlertIcon className="size-[18px] shrink-0 text-warning" />
        <Label>Ehtiyot böling</Label>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
          <CheckIcon className="size-4 shrink-0" />
          Xavfli şartlar topilmadi.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {items.map((w, i) => {
            const s = SEVERITY[w.severity];
            return (
              <li key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-page px-3.5 py-3 sm:flex-row sm:items-start sm:gap-3">
                <span className={`w-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${s.className}`}>
                  {s.label}
                </span>
                <span className="text-[15px] leading-snug">
                  {w.text}
                  <ClauseTag clauseRef={w.clauseRef} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const WHO: Record<SummaryWho, { label: string; className: string }> = {
  you: { label: 'Siz', className: 'bg-accent-soft text-accent' },
  other: { label: 'Boşqa tomon', className: 'bg-subtle text-muted' },
  both: { label: 'Ikkala tomon', className: 'bg-subtle text-ink' },
};

/** "Muddatlar": kept in the API's order (already sorted by time). */
function Deadlines({ items }: { items: SummaryDeadlineWire[] }) {
  return (
    <Card>
      <Heading dot="bg-warning">Muddatlar</Heading>
      <ul className="mt-4 divide-y divide-line">
        {items.map((d, i) => {
          const who = WHO[d.who];
          return (
            <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{d.when}</div>
                <div className="mt-0.5 text-[15px] leading-snug text-ink/85">
                  {d.what}
                  <ClauseTag clauseRef={d.clauseRef} />
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${who.className}`}>{who.label}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Points({ items, dot }: { items: SummaryPointWire[]; dot: string }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((p, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-snug">
          <span className={`mt-2 size-1.5 shrink-0 rounded-full ${dot}`} />
          <span>
            {p.text}
            <ClauseTag clauseRef={p.clauseRef} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Obligations({ items, dot }: { items: ObligationWire[]; dot: string }) {
  if (items.length === 0) return <p className="mt-4 text-sm text-muted">Alohida majburiyat körsatilmagan.</p>;
  return (
    <ul className="mt-4 space-y-3">
      {items.map((o, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-snug">
          <span className={`mt-2 size-1.5 shrink-0 rounded-full ${dot}`} />
          <span>
            {o.text}
            {(o.deadline || o.penalty) && (
              <span className="mt-1 block text-xs text-muted">
                {o.deadline && <>Muddat: {o.deadline}</>}
                {o.deadline && o.penalty && ' · '}
                {o.penalty && <>Javobgarlik: {o.penalty}</>}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
