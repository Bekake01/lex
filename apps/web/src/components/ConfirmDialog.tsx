'use client';

import { useEffect } from 'react';
import { XIcon } from './Icons';

/** Our own confirm (never `window.confirm`): title, text, a danger or primary action. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-md animate-fade-up overflow-y-auto rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Yopiş">
            <XIcon className="size-4" />
          </button>
        </div>
        <p className="px-5 py-4 text-sm text-muted">{text}</p>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="btn btn-ghost">
            Yöq
          </button>
          <button onClick={onConfirm} disabled={busy} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
