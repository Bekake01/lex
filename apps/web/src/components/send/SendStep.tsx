'use client';

import type { PartyWire, SigningRequestDetailWire } from '@lex/contracts';
import { useEffect, useState } from 'react';
import { documentParties } from '@/lib/signing';
import { AccessSettings } from './AccessSettings';

/** Step 3: title, message, which party they are, link settings, summary, send. */
export function SendStep({
  draft,
  peopleCount,
  fieldCount,
  title,
  message,
  partyName,
  onTitle,
  onMessage,
  onPartyName,
  onAccess,
  sending,
  error,
  onSend,
}: {
  draft: SigningRequestDetailWire;
  peopleCount: number;
  fieldCount: number;
  title: string;
  message: string;
  partyName: string;
  onTitle: (v: string) => void;
  onMessage: (v: string) => void;
  onPartyName: (v: string) => void;
  onAccess: (next: SigningRequestDetailWire) => void;
  sending: boolean;
  error: string;
  onSend: () => void;
}) {
  const [parties, setParties] = useState<PartyWire[]>([]);
  useEffect(() => {
    let cancelled = false;
    void documentParties(draft.documentId).then((p) => !cancelled && setParties(p));
    return () => {
      cancelled = true;
    };
  }, [draft.documentId]);

  const summary = [
    '1 hujjat',
    `${fieldCount} ta maydon`,
    `${peopleCount} ta odam`,
    draft.openLinkEnabled ? 'oçiq havola bor' : 'oçiq havola yöq',
    draft.hasPassword ? 'parol bilan' : 'parolsiz',
  ].join(' · ');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
        <h2 className="text-xl font-medium">Yuboriş</h2>

        <div className="mt-5 space-y-4">
          <Labeled label="Sarlavha">
            <input
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              maxLength={200}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent"
            />
          </Labeled>
          <Labeled label="Xabar" note="Imzolovçilar havolani oçganda köradi (ixtiyoriy).">
            <textarea
              value={message}
              onChange={(e) => onMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Assalomu alaykum! Iltimos, hujjatni körib çiqib imzolang."
              className="w-full rounded-lg border border-line bg-surface p-3 outline-none placeholder:text-faint focus:border-accent"
            />
          </Labeled>
          <Labeled label="Qaysi tomon" note="Imzolovçilar şartnomada kim — AI xulosasi şu tomon uçun yoziladi.">
            <input
              value={partyName}
              onChange={(e) => onPartyName(e.target.value)}
              list="party-suggestions"
              maxLength={200}
              placeholder="Masalan: Ijaraga oluvçi"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none placeholder:text-faint focus:border-accent"
            />
            <datalist id="party-suggestions">
              {parties.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.role}
                </option>
              ))}
            </datalist>
          </Labeled>
        </div>

        <h3 className="mt-8 mb-3 font-medium">Havola sozlamalari</h3>
        <AccessSettings request={draft} onChange={onAccess} />

        <div className="mt-8 rounded-2xl bg-subtle px-4 py-3 text-sm text-muted">{summary}</div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={onSend}
          disabled={sending || !title.trim() || (peopleCount === 0 && !draft.openLinkEnabled)}
          className="btn btn-primary btn-lg mt-4 w-full"
        >
          {sending ? 'Yuborilmoqda…' : 'Yuboriş'}
        </button>
        {peopleCount === 0 && !draft.openLinkEnabled && (
          <p className="mt-2 text-center text-sm text-muted">Odam qöşing yoki oçiq havolani yoqing.</p>
        )}
      </div>
    </div>
  );
}

function Labeled({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {note && <span className="ml-2 text-xs text-muted">{note}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
