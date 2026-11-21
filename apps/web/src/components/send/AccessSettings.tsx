'use client';

import type { SigningRequestDetailWire } from '@lex/contracts';
import { useState } from 'react';
import { ApiError, updateAccess } from '@/lib/signing';

/**
 * The optional open link and the optional password, both off by default. Saved
 * straight away (`PATCH …/access`) — this works on a draft and on a send that
 * is already out. `openLink={false}` shows only the password (the send flow
 * picks the open link with its own "Hamma uçun bitta havola" choice).
 */
export function AccessSettings({
  request,
  onChange,
  openLink = true,
}: {
  request: SigningRequestDetailWire;
  onChange: (next: SigningRequestDetailWire) => void;
  openLink?: boolean;
}) {
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(body: Parameters<typeof updateAccess>[1]) {
    setBusy(true);
    setError('');
    try {
      onChange(await updateAccess(request.id, body));
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const passwordOn = request.hasPassword || editingPassword;

  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {openLink && (
        <Toggle
          label="Oçiq havola"
          note="Bitta umumiy havola: kim oçsa, ismini yozib öz nusxasini imzolaydi."
          on={request.openLinkEnabled}
          disabled={busy}
          onToggle={() => void save({ openLinkEnabled: !request.openLinkEnabled })}
        />
      )}

      <div>
        <Toggle
          label="Parol qöyiş"
          note="Ixtiyoriy. Havolani oçganda parol söraladi — hamma uçun bitta parol."
          on={passwordOn}
          disabled={busy}
          onToggle={() => {
            if (request.hasPassword) {
              setEditingPassword(false);
              void save({ password: null });
            } else {
              setEditingPassword((v) => !v);
            }
          }}
        />
        {passwordOn && (
          <div className="px-4 pb-4">
            {request.hasPassword && !editingPassword ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-success">Parol qöyilgan</span>
                <button type="button" onClick={() => setEditingPassword(true)} className="btn btn-ghost btn-sm">
                  Özgartiriş
                </button>
              </div>
            ) : (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await save({ password })) {
                    setPassword('');
                    setEditingPassword(false);
                  }
                }}
              >
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kamida 4 ta belgi"
                  minLength={4}
                  maxLength={64}
                  autoComplete="off"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-page px-2.5 text-sm outline-none placeholder:text-faint focus:border-accent"
                />
                <button type="submit" disabled={busy || password.length < 4} className="btn btn-primary btn-sm">
                  Parolni saqlaş
                </button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted">Parolni havoladan alohida yuboring (masalan, qöngiroq qilib ayting).</p>
          </div>
        )}
      </div>

      {error && <p className="px-4 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  note,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  note: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-sm text-muted">{note}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative mt-0.5 h-6 w-10 shrink-0 cursor-pointer rounded-full transition disabled:opacity-50 ${on ? 'bg-accent' : 'bg-line-strong'}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-surface shadow-[0_1px_3px_var(--shadow)] transition-[left] ${
            on ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
