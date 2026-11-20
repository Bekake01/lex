'use client';

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { signingRequest as req } from '@/lib/demo';
import { CheckIcon, ChevronRightIcon, FileIcon, PenIcon, ShieldIcon, XIcon } from './Icons';

const STEPS = ['Xulosa', 'Majburiyatlar', 'Imzolaş'];

export function SigningFlow({ token }: { token: string }) {
  const [step, setStep] = useState(0);
  const [docOpen, setDocOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  const canSign = agree && typedName.trim().length > 2 && hasDrawn;

  function sign() {
    if (!canSign) return;
    setSigning(true);
    // TODO: POST /sign/:token with consent + signature → complete-signature job.
    setTimeout(() => {
      setSigning(false);
      setSignedAt(new Date().toLocaleString('uz-UZ'));
    }, 1400);
  }

  if (signedAt) return <Done signedAt={signedAt} token={token} />;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      {/* Intro */}
      <div className="animate-fade-up">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{req.sender.name}</span> sizga imzolaş uçun hujjat yubordi ·{' '}
          {req.sentAt}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{req.title}</h1>
        {req.note && (
          <p className="mt-4 rounded-xl border-l-[3px] border-accent bg-white px-4 py-3 text-[15px] text-ink/85 italic">
            “{req.note}”
          </p>
        )}
      </div>

      {/* Stepper */}
      <ol className="mt-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 text-sm ${i <= step ? 'text-ink' : 'text-slate-400'} ${i < step ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-semibold transition ${
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-accent text-white' : 'bg-sand text-slate-500'
                }`}
              >
                {i < step ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? 'bg-emerald-400' : 'bg-line'}`} />}
          </li>
        ))}
      </ol>

      <div key={step} className="mt-6 animate-fade-up">
        {step === 0 && (
          <Card>
            <Label>Qisqaça mazmuni</Label>
            <p className="mt-2 text-lg leading-relaxed">{req.summary}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {req.keyTerms.map((t) => (
                <div key={t.label} className="rounded-xl bg-cream px-4 py-3">
                  <div className="text-xs text-muted">{t.label}</div>
                  <div className="mt-0.5 font-medium">{t.value}</div>
                </div>
              ))}
            </div>
            <AiNote />
          </Card>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-accent" />
                <Label>Sizning majburiyatlaringiz</Label>
              </div>
              <p className="mt-1 text-xs text-muted">{req.recipient.role} sifatida</p>
              <List items={req.yourObligations} dot="bg-accent" />
            </Card>
            <Card>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-slate-400" />
                <Label>Boşqa tomon majburiyatlari</Label>
              </div>
              <p className="mt-1 text-xs text-muted">
                {req.sender.role} — {req.sender.name}
              </p>
              <List items={req.otherObligations} dot="bg-slate-400" />
            </Card>
          </div>
        )}

        {step === 2 && (
          <Card>
            <Label>Imzo</Label>
            <label className="mt-4 block">
              <span className="text-xs text-muted">Töliq ismingizni yozing</span>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={req.recipient.name}
                className="mt-1 w-full rounded-lg border border-line bg-cream px-3 py-2.5 outline-none placeholder:text-slate-400 focus:border-accent/50 focus:bg-white"
              />
            </label>
            <div className="mt-4">
              <span className="text-xs text-muted">Imzo çizing</span>
              <SignaturePad onChange={setHasDrawn} />
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-cream p-4 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 size-4 accent-[#0767ee]"
              />
              <span>
                Şartnoma matni va xulosasi bilan tanişdim. Uşbu elektron imzo qölda qöyilgan imzo bilan teng
                kuçga ega ekanligiga roziman.
              </span>
            </label>
          </Card>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setDocOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm hover:bg-sand"
        >
          <FileIcon className="size-4" /> Töliq matnni öqiş
        </button>
        <div className="ml-auto flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="rounded-lg px-4 py-2.5 text-sm text-muted hover:text-ink">
              Orqaga
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-black"
            >
              Davom etiş <ChevronRightIcon className="size-4" />
            </button>
          ) : (
            <button
              onClick={sign}
              disabled={!canSign || signing}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:bg-accent/40"
            >
              {signing ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <PenIcon className="size-4" />
              )}
              {signing ? 'Muhrlanmoqda…' : 'Imzolaş'}
            </button>
          )}
        </div>
      </div>

      {docOpen && <DocumentDrawer onClose={() => setDocOpen(false)} />}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">{children}</div>;
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-sm font-semibold">{children}</div>;
}

function List({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((o) => (
        <li key={o} className="flex gap-3 text-[15px] leading-snug">
          <span className={`mt-2 size-1.5 shrink-0 rounded-full ${dot}`} />
          {o}
        </li>
      ))}
    </ul>
  );
}

function AiNote() {
  return (
    <p className="mt-6 flex gap-2 border-t border-line pt-4 text-xs leading-relaxed text-muted">
      <ShieldIcon className="size-4 shrink-0" />
      Xulosa AI tomonidan yuboriş paytida tayyorlangan va özgarmaydi. Yuridik kuçga faqat şartnomaning töliq matni
      ega — uni pastdagi tugma orqali öqişingiz mumkin.
    </p>
  );
}

function DocumentDrawer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-[2px]" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl animate-fade-up flex-col bg-sand" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5 text-sm">
          <FileIcon className="size-4 text-muted" />
          <span className="font-medium">Töliq matn</span>
          <button onClick={onClose} className="ml-auto rounded-md p-1.5 text-muted hover:bg-sand" aria-label="Yopiş">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <article className="rounded-sm bg-white px-8 py-10 font-doc text-[15px] leading-7 text-slate-800 shadow-sm">
            <h2 className="text-center text-lg font-semibold uppercase tracking-wide">{req.title}</h2>
            {req.clauses.map((c) => (
              <section key={c.n} className="mt-5">
                <h3 className="font-semibold">
                  {c.n}. {c.title}
                </h3>
                <p className="indent-8">
                  {c.n}.1. {c.text}
                </p>
              </section>
            ))}
            <p className="mt-8 font-mono text-[11px] break-all text-slate-400">SHA-256: {req.documentHash}</p>
          </article>
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
    ctx.strokeStyle = '#001f29';
  }, []);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  }

  function clear() {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(false);
  }

  return (
    <div className="relative mt-1">
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-cream"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext('2d')!;
          const [x, y] = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          const [x, y] = point(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          if (empty) {
            setEmpty(false);
            onChange(true);
          }
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      {empty ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">
          Barmoq yoki siçqonça bilan şu yerga çizing
        </span>
      ) : (
        <button onClick={clear} className="absolute top-2 right-2 rounded-md bg-white px-2 py-1 text-xs text-muted shadow-sm hover:text-ink">
          Tozalaş
        </button>
      )}
      <span className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-slate-300" />
    </div>
  );
}

function Done({ signedAt, token }: { signedAt: string; token: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckIcon className="size-8" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold">Şartnoma imzolandi</h1>
        <p className="mt-2 text-muted">
          Muhrlangan nusxa va imzo sertifikati sizga va {req.sender.name}ga yuboriladi.
        </p>
        <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-white text-left text-sm">
          <Row k="Hujjat" v={req.title} />
          <Row k="Imzolangan vaqt" v={signedAt} />
          <Row k="Havola" v={`…/${token}`} mono />
          <Row k="SHA-256" v={`${req.documentHash.slice(0, 20)}…`} mono />
        </dl>
        <p className="mt-6 text-xs text-muted">Bu havola endi yopildi — şartnoma faqat bir marta imzolanadi.</p>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`truncate text-right ${mono ? 'font-mono text-xs leading-5' : ''}`}>{v}</dd>
    </div>
  );
}
