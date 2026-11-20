'use client';

import { SIGNING_ROUTES, type SigningStatus } from '@lex/contracts';
import { useEffect, useState } from 'react';
import { downloadFile, signJson } from '@/lib/sign-api';
import { CheckIcon, DownloadIcon, ShieldIcon } from '../Icons';

/**
 * After signing: wait until the server has sealed this copy (`GET …/status`
 * every 2 s), then offer the sealed PDF and the certificate. Also what a
 * reopened, already-signed link shows. Ported from tech award, minus the
 * account upsell.
 */
const POLL_MS = 2000;
/** ~3 minutes; a stuck worker then shows "later" instead of spinning forever. */
const MAX_POLLS = 90;

export function Completion({
  token,
  title,
  senderName,
  justSigned,
}: {
  token: string;
  title: string;
  senderName: string;
  justSigned: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [busy, setBusy] = useState<'signed' | 'certificate' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      polls += 1;
      try {
        const s = await signJson<SigningStatus>(SIGNING_ROUTES.signStatus(token), token);
        if (cancelled) return;
        if (s.ready) return setReady(true);
      } catch {
        // transient — try again
      }
      if (cancelled) return;
      if (polls >= MAX_POLLS) return setGaveUp(true);
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  async function download(kind: 'signed' | 'certificate') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'signed') {
        await downloadFile(SIGNING_ROUTES.signSigned(token), token, `${title}.pdf`);
      } else {
        await downloadFile(SIGNING_ROUTES.signCertificate(token), token, `${title} — sertifikat.pdf`);
      }
    } catch {
      setError('Faylni yuklab bölmadi. Qayta urinib köring.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success">
          <CheckIcon className="size-8" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold sm:text-3xl">
          {justSigned ? 'Hujjat imzolandi' : 'Siz bu hujjatni imzolagansiz'}
        </h1>
        <p className="mt-2 text-muted">
          <span className="font-medium text-ink">{title}</span>
          <br />
          {senderName} sizning imzolangan nusxangizni oladi.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 text-left">
          {ready ? (
            <div className="flex flex-col gap-2">
              <button onClick={() => void download('signed')} disabled={busy !== null} className="btn btn-primary w-full">
                {busy === 'signed' ? <Spinner /> : <DownloadIcon className="size-4" />}
                Nusxani yuklab oliş
              </button>
              <button
                onClick={() => void download('certificate')}
                disabled={busy !== null}
                className="btn btn-secondary w-full"
              >
                {busy === 'certificate' ? <Spinner dark /> : <ShieldIcon className="size-4" />}
                Sertifikat
              </button>
              {error && <p className="mt-1 text-center text-sm text-danger">{error}</p>}
            </div>
          ) : gaveUp ? (
            <p className="text-center text-sm text-muted">
              Nusxa hali tayyor emas. Bu havolani keyinroq qayta oçing — yuklab oliş şu yerda böladi.
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-muted">
              <Spinner dark /> Muhrlangan nusxa tayyorlanmoqda…
            </p>
          )}
        </div>

        <p className="mt-6 text-xs text-muted">
          Bu havola bilan hujjat faqat bir marta imzolanadi. Nusxani istalgan payt şu havoladan yuklab olişingiz mumkin.
        </p>
      </div>
    </div>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`size-4 animate-spin rounded-full border-2 ${
        dark ? 'border-accent/25 border-t-accent' : 'border-on-color/40 border-t-on-color'
      }`}
    />
  );
}
