'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { onUpgrade } from '@/lib/billing';
import { XIcon } from '../Icons';

/**
 * Shown when the API says the plan's limit is reached (402). Mounted once in
 * the signed-in layout; anything calls `showUpgrade()` to open it.
 */
export function UpgradeDialog() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => onUpgrade((m) => setMessage(m || 'Tarifingiz limiti tugadi.')), []);

  useEffect(() => {
    if (message === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMessage(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message]);

  if (message === null) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4 backdrop-blur-[2px]" onClick={() => setMessage(null)}>
      <div
        role="dialog"
        aria-modal
        aria-label="Tarifni oşiriş"
        className="w-full max-w-md animate-fade-up rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Limit tugadi</div>
            <p className="mt-1 text-sm text-muted">{message}</p>
          </div>
          <button onClick={() => setMessage(null)} className="btn btn-ghost btn-icon btn-sm" aria-label="Yopiş">
            <XIcon className="size-4" />
          </button>
        </div>
        <p className="px-5 pt-3 text-sm text-ink/80">
          <b>Şaxsiy</b> tarif — oyiga 20 ta tekşiruv, <b>Kompaniya</b> — jamoa uçun 150 ta umumiy tekşiruv.
        </p>
        <div className="flex justify-end gap-2 px-5 py-5">
          <button onClick={() => setMessage(null)} className="btn btn-ghost">
            Keyinroq
          </button>
          <Link href="/pricing" onClick={() => setMessage(null)} className="btn btn-primary">
            Tariflarni köriş
          </Link>
        </div>
      </div>
    </div>
  );
}
