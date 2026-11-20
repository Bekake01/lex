'use client';

import type { SignatureMethod } from '@lex/contracts';
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { INK, canvasToTrimmedPng, typedSignatureToPng, uploadedFileToPng } from '@/lib/signature-image';
import { CheckIcon, PenIcon, TypeIcon, UploadIcon, XIcon } from '../Icons';

/**
 * "Imzoni tanlang": type it, draw it, or upload a picture. Output is one PNG
 * data URL + the method. Ported from tech award. System handwriting faces only
 * (no webfont on the public box). The pad is paper-white in both themes, so
 * the ink reads on the white PDF it is stamped into.
 */
export interface AdoptedSignature {
  dataUrl: string;
  method: SignatureMethod;
}

const FONTS = [
  { label: 'Imzo', css: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' },
  { label: 'Rasmiy', css: '"Palatino Linotype", Palatino, Georgia, serif' },
  { label: 'Oddiy', css: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive' },
];

type Tab = 'draw' | 'type' | 'upload';

const TABS = [
  { key: 'draw', label: 'Çiziş', icon: PenIcon },
  { key: 'type', label: 'Yoziş', icon: TypeIcon },
  { key: 'upload', label: 'Yuklaş', icon: UploadIcon },
] as const;

export function AdoptSignature({
  defaultName,
  onAdopt,
  onClose,
}: {
  defaultName: string;
  onAdopt: (sig: AdoptedSignature) => void;
  onClose: () => void;
}) {
  // Drawing first: on a phone, a finger signature is what people expect.
  const [tab, setTab] = useState<Tab>('draw');
  const [typed, setTyped] = useState(defaultName);
  const [fontIdx, setFontIdx] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    setHasInk(false);
  }, [tab]);

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startStroke(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = drawRef.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function extendStroke(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = drawRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }
  function endStroke() {
    drawing.current = false;
  }
  function clearDrawing() {
    const canvas = drawRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setUploadPreview(await uploadedFileToPng(file));
    } catch (err) {
      setUploadPreview(null);
      setError(err instanceof Error ? err.message : 'Rasmni öqib bölmadi.');
    } finally {
      setBusy(false);
    }
  }

  function adopt() {
    setError(null);
    try {
      if (tab === 'type') {
        const png = typedSignatureToPng(typed, FONTS[fontIdx]!.css);
        if (!png) return setError('Avval ismingizni yozing.');
        return onAdopt({ dataUrl: png, method: 'typed' });
      }
      if (tab === 'draw') {
        const png = drawRef.current ? canvasToTrimmedPng(drawRef.current) : null;
        if (!png) return setError('Avval imzo çizing.');
        return onAdopt({ dataUrl: png, method: 'drawn' });
      }
      if (!uploadPreview) return setError('Avval rasm tanlang.');
      return onAdopt({ dataUrl: uploadPreview, method: 'uploaded' });
    } catch {
      setError('Imzoni tayyorlab bölmadi. Boşqa usulni sinab köring.');
    }
  }

  const canAdopt =
    (tab === 'type' && typed.trim().length > 0) ||
    (tab === 'draw' && hasInk) ||
    (tab === 'upload' && Boolean(uploadPreview));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imzoni tanlang"
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl animate-fade-up overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">Imzoni tanlang</h2>
          <button onClick={onClose} aria-label="Yopiş" className="btn btn-ghost btn-icon btn-sm">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-1 rounded-xl bg-subtle p-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setError(null);
                }}
                aria-pressed={tab === key}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          {tab === 'draw' && (
            <div>
              <div className="relative">
                <canvas
                  ref={drawRef}
                  onPointerDown={startStroke}
                  onPointerMove={extendStroke}
                  onPointerUp={endStroke}
                  onPointerLeave={endStroke}
                  className="h-44 w-full touch-none rounded-xl border border-dashed border-line-strong bg-paper"
                />
                {!hasInk && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-faint">
                    Barmoq yoki siçqonça bilan şu yerga çizing
                  </span>
                )}
                <span className="pointer-events-none absolute right-6 bottom-9 left-6 border-b border-line-strong" />
              </div>
              <button type="button" onClick={clearDrawing} className="btn btn-ghost btn-sm mt-2" disabled={!hasInk}>
                Tozalaş
              </button>
            </div>
          )}

          {tab === 'type' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-muted">Ismingiz</span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  maxLength={100}
                  className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2.5 outline-none focus:border-accent/50 focus:bg-surface"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {FONTS.map((f, i) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFontIdx(i)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      fontIdx === i ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper px-4">
                <span className="truncate text-4xl text-paper-ink" style={{ fontFamily: FONTS[fontIdx]!.css }}>
                  {typed.trim() || 'Ismingiz'}
                </span>
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Imzongiz rasmi yoki skani (PNG, JPG yoki WebP, 5 MB gaça).</p>
              <label className="btn btn-secondary w-full cursor-pointer">
                <UploadIcon className="size-4" /> Rasm tanlaş
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void onPickFile(e)}
                  className="sr-only"
                />
              </label>
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper">
                {busy ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
                ) : uploadPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadPreview} alt="Imzongiz" className="max-h-28 max-w-full object-contain" />
                ) : (
                  <span className="text-sm text-faint">Rasm tanlanmagan</span>
                )}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Bekor qiliş
          </button>
          <button type="button" onClick={adopt} disabled={!canAdopt || busy} className="btn btn-primary px-5">
            <CheckIcon className="size-4" /> Imzoni qöyiş
          </button>
        </div>
      </div>
    </div>
  );
}
