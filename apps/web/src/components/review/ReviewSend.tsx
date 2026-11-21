'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DocumentWire } from '@lex/contracts';
import { DEMO_LOGIN } from '@/lib/auth';
import { createDraft, DEMO_DRAFT_ID, sendStartError } from '@/lib/signing';
import { SendIcon, XIcon } from '../Icons';

const isPdf = (doc: DocumentWire) => doc.contentType === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf');

/**
 * "Imzoga yuboriş" on a finished review. A PDF opens the send flow for this
 * very document (a new draft → the field editor). Sending is PDF-only, so a
 * Word or text file gets a short "convert it first" note instead.
 */
export function SendForSigning({ doc }: { doc: DocumentWire }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<'pdf' | 'error' | null>(null);
  const [error, setError] = useState('');

  async function start() {
    if (!isPdf(doc)) {
      setNote(note === 'pdf' ? null : 'pdf');
      return;
    }
    if (DEMO_LOGIN) return router.push(`/documents/send/${DEMO_DRAFT_ID}`);
    setBusy(true);
    setNote(null);
    try {
      router.push(`/documents/send/${(await createDraft(doc.id)).id}`);
    } catch (err) {
      setError(sendStartError(err));
      setNote('error');
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button onClick={() => void start()} disabled={busy} className="btn btn-primary btn-sm" aria-expanded={note !== null}>
        <SendIcon className="size-4" />
        <span className="hidden sm:inline">{busy ? 'Tayyorlanmoqda…' : 'Imzoga yuboriş'}</span>
      </button>

      {note && (
        <div
          role={note === 'error' ? 'alert' : 'dialog'}
          aria-label="Imzoga yuboriş"
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-fade-up rounded-xl border border-line bg-surface p-4 text-sm shadow-lg"
        >
          <button
            onClick={() => setNote(null)}
            className="btn btn-ghost btn-icon btn-sm absolute right-2 top-2"
            aria-label="Yopiş"
          >
            <XIcon className="size-4" />
          </button>
          {note === 'error' ? (
            <p className="pr-6 text-danger">{error}</p>
          ) : (
            <>
              <p className="pr-6 font-medium">Imzolaş uçun PDF kerak</p>
              <p className="mt-1.5 text-ink/80">
                Imzoga faqat PDF yuboriladi. Faylni Word'da oçing: <b>Fayl → Saqlaş</b>, turini <b>PDF</b> qilib
                saqlang. Söng PDF ni Hujjatlar sahifasida «Imzoga yuboriş» orqali yuklang.
              </p>
              {!doc.isLatest && (
                <p className="mt-1.5 text-xs text-muted">Eng yangi versiyani yuklab olib, uni PDF qiling.</p>
              )}
              <Link href="/contracts" className="btn btn-secondary btn-sm mt-3">
                Hujjatlarga ötiş
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
