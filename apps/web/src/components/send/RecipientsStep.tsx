'use client';

import type { SigningRequestDetailWire } from '@lex/contracts';
import { useState } from 'react';
import type { PersonRow } from '@/lib/people';
import { ApiError, updateAccess } from '@/lib/signing';
import { LinkIcon, UserIcon } from '../Icons';
import { AccessSettings } from './AccessSettings';
import { PeopleEditor } from './PeopleEditor';

export type RecipientMode = 'people' | 'link';

/** A draft with only the open link (no people) is a "link" send; anything else is "people". */
export function initialMode(draft: SigningRequestDetailWire): RecipientMode {
  return draft.openLinkEnabled && draft.recipients.length === 0 ? 'link' : 'people';
}

/**
 * Step 2: who signs. Either specific people (each gets their own link) or one
 * shared link (no list to fill in). The optional password works for both.
 */
export function RecipientsStep({
  draft,
  mode,
  people,
  onMode,
  onPeople,
  onAccess,
}: {
  draft: SigningRequestDetailWire;
  mode: RecipientMode;
  people: PersonRow[];
  onMode: (mode: RecipientMode) => void;
  onPeople: (rows: PersonRow[]) => void;
  onAccess: (next: SigningRequestDetailWire) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(next: RecipientMode) {
    if (next === mode || busy) return;
    setBusy(true);
    setError('');
    try {
      // The shared link is on only in "link" mode.
      if (draft.openLinkEnabled !== (next === 'link')) {
        onAccess(await updateAccess(draft.id, { openLinkEnabled: next === 'link' }));
      }
      onMode(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        <h2 className="text-xl font-medium">Kimga yuborasiz?</h2>

        <div role="radiogroup" aria-label="Qabul qiluvçilar" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Choice
            on={mode === 'people'}
            disabled={busy}
            onClick={() => void choose('people')}
            Icon={UserIcon}
            title="Har kimga alohida havola"
            note="Havola har biriga email, Telegram yoki SMS orqali boradi. Kim imzolagani körinib turadi."
          />
          <Choice
            on={mode === 'link'}
            disabled={busy}
            onClick={() => void choose('link')}
            Icon={LinkIcon}
            title="Hamma uçun bitta havola"
            note="Bitta havolani özingiz ulaşasiz. Uni oçgan har kim hujjatni alohida imzolaydi."
          />
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        {mode === 'people' ? (
          <div className="mt-6">
            <h3 className="mb-3 font-medium">Qabul qiluvçilar</h3>
            <PeopleEditor rows={people} onChange={onPeople} />
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-subtle px-4 py-3 text-sm text-muted">
            Havolani yuborganingizdan keyin olasiz — uni istalgan joyda ulaşiş mumkin.
          </p>
        )}

        <div className="mt-8">
          <AccessSettings request={draft} onChange={onAccess} openLink={false} />
        </div>
      </div>
    </div>
  );
}

function Choice({
  on,
  disabled,
  onClick,
  Icon,
  title,
  note,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  Icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-wait ${
        on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${on ? 'bg-accent text-on-color' : 'bg-subtle text-muted'}`}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{note}</span>
      </span>
    </button>
  );
}
