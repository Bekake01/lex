'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { contract } from '@/lib/demo';
import { AlertIcon, PenIcon, XIcon } from '../Icons';

export function SignDialog({
  openHigh,
  onClose,
  onSigned,
}: {
  openHigh: number;
  onClose: () => void;
  onSigned: () => void;
}) {
  const [name, setName] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = name.trim().length > 2 && hasInk && agree;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-lg animate-fade-up rounded-2xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-semibold">Imzolaş</div>
            <div className="text-xs text-muted">{contract.title}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Yopiş">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {openHigh > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
              <AlertIcon className="size-5 shrink-0 text-danger" />
              {openHigh} ta yuqori xavfli band hal qilinmagan. Imzolaşdan oldin özgartiriş söraşni öylab köring.
            </div>
          )}

          <label className="block">
            <span className="text-xs text-muted">Töliq ism</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Familiya Ism Şarif"
              className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none placeholder:text-faint focus:border-accent/50"
            />
          </label>

          <div>
            <span className="text-xs text-muted">Imzo</span>
            <SignaturePad onChange={setHasInk} />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 size-4 accent-accent"
            />
            Şartnoma bilan tanişdim va elektron imzo qölda qöyilgan imzoga teng ekanligiga roziman.
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="btn btn-ghost">
            Bekor qiliş
          </button>
          <button
            onClick={() => {
              setBusy(true);
              setTimeout(onSigned, 1200);
            }}
            disabled={!ready || busy}
            className="btn btn-primary px-5"
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-on-color/40 border-t-on-color" />
            ) : (
              <PenIcon className="size-4" />
            )}
            {busy ? 'Muhrlanmoqda…' : 'Imzolaş'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (hasInk: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="relative mt-1">
      <canvas
        ref={canvas}
        className="h-36 w-full touch-none rounded-xl border border-dashed text-ink border-line-strong bg-page"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext('2d')!;
          ctx.strokeStyle = getComputedStyle(e.currentTarget).color; // ink of the current theme
          ctx.beginPath();
          ctx.moveTo(...point(e));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          ctx.lineTo(...point(e));
          ctx.stroke();
          if (empty) {
            setEmpty(false);
            onChange(true);
          }
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      {empty ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-faint">
          Şu yerga çizing
        </span>
      ) : (
        <button
          onClick={() => {
            const c = canvas.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(false);
          }}
          className="absolute top-2 right-2 rounded-md bg-surface px-2 py-1 text-xs text-muted shadow-sm hover:text-ink"
        >
          Tozalaş
        </button>
      )}
    </div>
  );
}
