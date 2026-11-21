'use client';

import {
  SIGNING_ERROR_CODES,
  SIGNING_ROUTES,
  compactPhone,
  type OpenLinkInfo,
  type OpenLinkStartResponse,
} from '@lex/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { SignApiError, saveTicket, signJson } from '@/lib/sign-api';
import { ChevronRightIcon, LockIcon, PenIcon } from '../Icons';
import { Centered, InvalidLink, Loading, Spinner } from './States';

/**
 * `/open/<publicToken>`: the send's shared link. The person says who they are
 * (and gives the password if there is one); the API makes their own copy and
 * we continue on that copy's `/sign/<token>`.
 */
export function OpenLinkStart({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<OpenLinkInfo | null | 'invalid'>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    signJson<OpenLinkInfo>(SIGNING_ROUTES.openLink(publicToken), null)
      .then(setInfo)
      .catch(() => setInfo('invalid'));
  }, [publicToken]);

  if (info === null) return <Loading />;
  if (info === 'invalid') return <InvalidLink />;

  const phoneBad = phone.trim() !== '' && !/^\+?\d{7,15}$/.test(compactPhone(phone));
  const canStart = name.trim().length > 0 && !phoneBad && (!info.needsPassword || password.length > 0) && !busy;

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!canStart || info === null || info === 'invalid') return;
    setBusy(true);
    setError(null);
    try {
      const res = await signJson<OpenLinkStartResponse>(SIGNING_ROUTES.openLinkStart(publicToken), null, {
        method: 'POST',
        body: {
          name: name.trim(),
          phone: phone.trim() || undefined,
          password: info.needsPassword ? password : undefined,
        },
      });
      if (res.ticket) saveTicket(res.token, res.ticket);
      router.replace(`/sign/${res.token}`);
    } catch (err) {
      setBusy(false);
      if (err instanceof SignApiError && err.code === SIGNING_ERROR_CODES.wrongPassword) {
        return setError('Parol notoğri');
      }
      if (err instanceof SignApiError && err.status === 404) return setInfo('invalid');
      setError('Boşlab bölmadi. Qayta urinib köring.');
    }
  }

  const input =
    'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 outline-none placeholder:text-faint focus:border-accent/50';

  return (
    <Centered>
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <PenIcon className="size-7" />
      </span>
      <p className="mt-5 text-sm text-muted">
        <span className="font-medium text-ink">{info.senderName}</span> imzolaşga taklif qildi
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{info.title}</h1>
      <form onSubmit={(e) => void start(e)} className="mt-6 space-y-3 text-left">
        <label className="block">
          <span className="text-xs text-muted">Ism familiya</span>
          <input
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Familiya Ism"
            className={input}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Telefon (ixtiyoriy)</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            placeholder="+998 90 123 45 67"
            className={input}
          />
          {phoneBad && <span className="mt-1 block text-xs text-danger">Telefon raqami notoğri</span>}
        </label>
        {info.needsPassword && (
          <label className="block">
            <span className="flex items-center gap-1 text-xs text-muted">
              <LockIcon className="size-3.5" /> Parol
            </span>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={64}
              className={input}
            />
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={!canStart} className="btn btn-primary w-full">
          {busy ? <Spinner light /> : null} Davom etiş <ChevronRightIcon className="size-4" />
        </button>
      </form>
      <p className="mt-4 text-xs text-muted">Siz uçun alohida nusxa oçiladi — uni faqat siz imzolaysiz.</p>
    </Centered>
  );
}
