'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { LinkOffIcon, LockIcon } from '../Icons';

/** One friendly page for every reason a link does not work (unknown, cancelled, not sent yet). */
export function InvalidLink() {
  return (
    <Centered>
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-subtle text-muted">
        <LinkOffIcon className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">Havola yaroqsiz</h1>
      <p className="mt-2 text-muted">
        Havola notoğri, yoki yuboruvçi uni bekor qilgan. Hujjatni imzolaşingiz kerak bölsa, yuboruvçidan yangi havola
        sörang.
      </p>
    </Centered>
  );
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner />
    </div>
  );
}

export function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      className={`inline-block size-5 animate-spin rounded-full border-2 ${
        light ? 'size-4 border-on-color/40 border-t-on-color' : 'border-accent/25 border-t-accent'
      }`}
    />
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md animate-fade-up text-center">{children}</div>
    </div>
  );
}

/** "Parol" — the link has a password. `onSubmit` throws an Error with the message to show. */
export function PasswordGate({ title, onSubmit }: { title: string; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
      setBusy(false);
    }
  }

  return (
    <Centered>
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <LockIcon className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted">Bu hujjat parol bilan himoyalangan. Parolni yuboruvçidan oling.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 text-left">
        <label className="block">
          <span className="text-xs text-muted">Parol</span>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={64}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent/50"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={!password || busy} className="btn btn-primary mt-4 w-full">
          {busy && <Spinner light />} Oçiş
        </button>
      </form>
    </Centered>
  );
}
