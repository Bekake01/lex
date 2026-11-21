import type { ObligationWire, RecipientSummaryWire } from '@lex/contracts';
import type { ReactNode } from 'react';
import { ShieldIcon } from '../Icons';

/** Step "Xulosa": the AI summary written at send time (`GET /sign/:token/summary`). */
export function SummaryStep({ summary }: { summary: RecipientSummaryWire }) {
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-accent" />
            <Label>Sizning majburiyatlaringiz</Label>
          </div>
          <p className="mt-1 text-xs text-muted">{summary.partyName} sifatida</p>
          <Obligations items={summary.yourObligations} dot="bg-accent" />
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-faint" />
            <Label>Boşqa tomon majburiyatlari</Label>
          </div>
          <Obligations items={summary.otherObligations} dot="bg-faint" />
        </Card>
      </div>

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
