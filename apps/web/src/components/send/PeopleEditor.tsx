'use client';

import type { DeliveryChannel } from '@lex/contracts';
import { useState } from 'react';
import { blankRow, CHANNELS, isEmptyRow, MAX_PEOPLE, parseList, rowProblem, type PersonRow } from '@/lib/people';
import { AtIcon, LinkIcon, MessageIcon, PlusIcon, TelegramIcon, XIcon } from '../Icons';

export const CHANNEL_ICON: Record<DeliveryChannel, (p: { className?: string }) => React.ReactNode> = {
  email: AtIcon,
  telegram: TelegramIcon,
  sms: MessageIcon,
  link: LinkIcon,
};

/**
 * The people a send goes to: name (optional) · channel · contact. Used by step
 * 2 of the send flow and by "Odam qöşiş" on the detail page. Errors come from
 * the same contract check the server runs.
 */
export function PeopleEditor({ rows, onChange }: { rows: PersonRow[]; onChange: (rows: PersonRow[]) => void }) {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const update = (key: string, patch: Partial<PersonRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const full = rows.length >= MAX_PEOPLE;

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const problem = isEmptyRow(row) ? null : rowProblem(row);
          const channel = CHANNELS.find((c) => c.id === row.channel)!;
          return (
            <li key={row.key}>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 sm:flex-nowrap">
                <span className="w-6 shrink-0 text-center text-sm text-faint">{i + 1}</span>
                <input
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  placeholder="Ism (ixtiyoriy)"
                  maxLength={200}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-page px-2.5 text-sm outline-none placeholder:text-faint focus:border-accent sm:max-w-[200px]"
                />
                <div role="radiogroup" aria-label="Kanal" className="flex shrink-0 rounded-lg bg-subtle p-0.5">
                  {CHANNELS.map((c) => {
                    const Icon = CHANNEL_ICON[c.id];
                    const on = c.id === row.channel;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={c.label}
                        onClick={() => update(row.key, { channel: c.id })}
                        className={`flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs transition ${
                          on ? 'bg-surface font-medium text-ink shadow-[0_1px_3px_var(--shadow)]' : 'text-muted hover:text-ink'
                        }`}
                      >
                        <Icon className="size-3.5" />
                        <span className="hidden md:inline">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
                {row.channel !== 'link' ? (
                  <input
                    value={row.contact}
                    onChange={(e) => update(row.key, { contact: e.target.value })}
                    placeholder={channel.placeholder}
                    inputMode={row.channel === 'sms' ? 'tel' : row.channel === 'email' ? 'email' : 'text'}
                    aria-invalid={problem ? true : undefined}
                    className={`h-9 min-w-0 flex-1 rounded-lg border bg-page px-2.5 text-sm outline-none placeholder:text-faint ${
                      problem ? 'border-danger' : 'border-line focus:border-accent'
                    }`}
                  />
                ) : (
                  <span className="flex-1 px-1 text-sm text-faint">Havolani özingiz yuborasiz</span>
                )}
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  aria-label={`${i + 1}-odamni olib taşlaş`}
                  className="btn btn-ghost btn-icon btn-sm shrink-0"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              {problem && <p className="mt-1 ml-10 text-xs text-danger">{problem}</p>}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={full}
          onClick={() => onChange([...rows, blankRow(rows.at(-1)?.channel)])}
          className="btn btn-secondary btn-sm"
        >
          <PlusIcon className="size-4" />
          Odam qöşiş
        </button>
        <button type="button" disabled={full} onClick={() => setPasting((v) => !v)} className="btn btn-ghost btn-sm">
          Röyxatni qöyiş
        </button>
        <span className="ml-auto self-center text-sm text-muted">
          {rows.length} / {MAX_PEOPLE}
        </span>
      </div>

      {pasting && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3">
          <p className="text-sm text-muted">Har qatorda bitta odam: «Ism, kontakt» yoki faqat kontakt.</p>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            placeholder={'Dilnoza Yusupova, dilnoza@pochta.uz\nJavlon, @javlon_r\n+998 90 123 45 67'}
            className="mt-2 w-full rounded-lg border border-line bg-page p-2.5 font-mono text-sm outline-none placeholder:text-faint focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setPasting(false)} className="btn btn-ghost btn-sm">
              Bekor qiliş
            </button>
            <button
              type="button"
              disabled={!pasted.trim()}
              onClick={() => {
                const added = parseList(pasted).slice(0, MAX_PEOPLE - rows.length);
                onChange([...rows.filter((r) => !isEmptyRow(r)), ...added]);
                setPasted('');
                setPasting(false);
              }}
              className="btn btn-primary btn-sm"
            >
              Qöşiş
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
