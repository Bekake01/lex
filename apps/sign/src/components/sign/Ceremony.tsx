'use client';

import {
  DATE_INPUT_MAX,
  DATE_INPUT_MIN,
  FIELD_VALUE_RULES,
  sanitizeFieldInput,
  type Field,
  type FieldType,
} from '@lex/contracts';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { fieldKind, fieldLabel, fieldProblem } from '@/lib/sign-fields';
import { PenIcon } from '../Icons';

/**
 * The PDF with the fields to fill, ported from tech award's ceremony. Pages fit
 * the screen width (most people open the link on a phone). Field coordinates
 * are page fractions, so the overlay is laid out in percent. Values live in the
 * parent; this only renders them. Same input rules as the server
 * (`FIELD_VALUE_RULES`): impossible characters are dropped as typed, a value
 * that is still wrong turns the box red with the reason under it.
 */
const MAX_PAGE_WIDTH = 860;

/** The keyboard a phone shows, and the native calendar for a date. Presentation only. */
const INPUT_TYPE: Partial<Record<FieldType, string>> = {
  email: 'email',
  phone: 'tel',
  date_input: 'date',
};
const INPUT_MODE: Partial<Record<FieldType, HTMLAttributes<HTMLInputElement>['inputMode']>> = {
  number: 'decimal',
  phone: 'tel',
  email: 'email',
};

export function fieldElementId(field: Field): string {
  return `field-${field.id}`;
}

export function Ceremony({
  pdf,
  fields,
  values,
  signature,
  activeId,
  onActive,
  onChange,
  onMarkClick,
}: {
  pdf: PDFDocumentProxy;
  fields: Field[];
  values: Record<string, string>;
  /** The adopted signature PNG, shown in every mark field. */
  signature: string | null;
  activeId: string | null;
  onActive: (id: string) => void;
  onChange: (id: string, value: string) => void;
  onMarkClick: (field: Field) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.min(MAX_PAGE_WIDTH, Math.floor(entry!.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  return (
    <div ref={wrap} className="w-full">
      {width > 0 && (
        <div className="mx-auto flex flex-col items-center gap-4" style={{ width }}>
          {pages.map((n) => (
            <Page
              key={n}
              pdf={pdf}
              pageNumber={n}
              width={width}
              fields={fields.filter((f) => f.page === n)}
              values={values}
              signature={signature}
              activeId={activeId}
              onActive={onActive}
              onChange={onChange}
              onMarkClick={onMarkClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Page({
  pdf,
  pageNumber,
  width,
  fields,
  values,
  signature,
  activeId,
  onActive,
  onChange,
  onMarkClick,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  fields: Field[];
  values: Record<string, string>;
  signature: string | null;
  activeId: string | null;
  onActive: (id: string) => void;
  onChange: (id: string, value: string) => void;
  onMarkClick: (field: Field) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setHeight(viewport.height);
      const render = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      task = render;
      await render.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width]);

  return (
    // Paper is white in both themes, so the boxes on it use the light tokens.
    <div
      data-theme="light"
      className="relative overflow-hidden rounded-sm bg-paper shadow-[0_4px_20px_var(--shadow)] ring-1 ring-line"
      style={{ width, height: height ?? width * 1.414 }}
    >
      <canvas ref={canvasRef} className="block" />
      {height !== null &&
        fields.map((f) => (
          <FieldBox
            key={f.id}
            field={f}
            pageHeight={height}
            value={values[f.id] ?? ''}
            signature={signature}
            active={activeId === f.id}
            onActive={() => onActive(f.id)}
            onChange={(v) => onChange(f.id, v)}
            onMarkClick={() => onMarkClick(f)}
          />
        ))}
    </div>
  );
}

function FieldBox({
  field: f,
  pageHeight,
  value,
  signature,
  active,
  onActive,
  onChange,
  onMarkClick,
}: {
  field: Field;
  pageHeight: number;
  value: string;
  signature: string | null;
  active: boolean;
  onActive: () => void;
  onChange: (value: string) => void;
  onMarkClick: () => void;
}) {
  const kind = fieldKind(f);
  const style: CSSProperties = {
    left: `${f.x * 100}%`,
    top: `${f.y * 100}%`,
    width: `${f.w * 100}%`,
    height: `${f.h * 100}%`,
  };
  // Text sized to the box, so a filled field looks like the stamped copy.
  const fontSize = Math.max(9, Math.min(16, f.h * pageHeight * 0.62));
  const id = fieldElementId(f);
  const ring = active ? 'ring-2 ring-accent' : '';

  if (kind === 'mark') {
    return (
      <button
        id={id}
        type="button"
        onClick={() => {
          onActive();
          onMarkClick();
        }}
        style={style}
        aria-label={signature ? `${fieldLabel(f)} qöyildi` : `${fieldLabel(f)} qöyiş`}
        className={`absolute flex items-center justify-center rounded-[3px] transition ${ring} ${
          signature
            ? 'border border-line-strong/60 bg-paper/40'
            : 'border-2 border-warning bg-warning-soft/90 font-semibold text-warning hover:brightness-95'
        }`}
      >
        {signature ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signature} alt="Imzongiz" className="size-full object-contain p-0.5" />
        ) : (
          <span className="flex items-center gap-1 leading-none" style={{ fontSize: Math.max(10, fontSize * 0.8) }}>
            <PenIcon className="size-3" />
            {fieldLabel(f)}
            {f.required && ' *'}
          </span>
        )}
      </button>
    );
  }

  if (kind === 'auto') {
    return (
      <div
        id={id}
        style={{ ...style, fontSize: Math.max(9, fontSize * 0.8) }}
        title="Imzolagan kuningiz avtomatik qöyiladi"
        className="absolute flex items-center overflow-hidden rounded-[3px] border border-dashed border-line-strong bg-subtle/70 px-1 whitespace-nowrap text-muted italic"
      >
        imzolaganda qöyiladi
      </div>
    );
  }

  const label = fieldLabel(f);

  if (f.type === 'checkbox') {
    return (
      <label
        id={id}
        style={style}
        className={`absolute grid cursor-pointer place-items-center rounded-[3px] border-2 ${
          value === 'true' ? 'border-accent bg-accent-soft' : 'border-warning bg-warning-soft/90'
        } ${ring}`}
      >
        <input
          type="checkbox"
          aria-label={label}
          checked={value === 'true'}
          onFocus={onActive}
          onChange={(e) => onChange(e.target.checked ? 'true' : '')}
          className="size-[80%] cursor-pointer accent-accent"
        />
      </label>
    );
  }

  const empty = value.trim() === '';
  const problem = fieldProblem(f, value);
  const border = problem
    ? 'border-danger bg-danger-soft/90'
    : empty && f.required
      ? 'border-warning bg-warning-soft/90'
      : 'border-accent/50 bg-accent-soft/80';

  if (f.type === 'dropdown' || f.type === 'radio') {
    return (
      <select
        id={id}
        aria-label={label}
        value={value}
        onFocus={onActive}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...style, fontSize }}
        className={`absolute rounded-[3px] border px-0.5 text-paper-ink outline-none ${border} ${ring}`}
      >
        <option value="">{label}…</option>
        {(f.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  const rule = FIELD_VALUE_RULES[f.type];
  return (
    <>
      <input
        id={id}
        type={INPUT_TYPE[f.type] ?? 'text'}
        inputMode={INPUT_MODE[f.type]}
        autoComplete="off"
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        title={problem ?? label}
        value={value}
        maxLength={rule?.max}
        min={f.type === 'date_input' ? DATE_INPUT_MIN : undefined}
        max={f.type === 'date_input' ? DATE_INPUT_MAX : undefined}
        placeholder={f.required ? `${label} *` : label}
        onFocus={onActive}
        onChange={(e) => onChange(sanitizeFieldInput(f.type, e.target.value))}
        style={{ ...style, fontSize }}
        className={`absolute rounded-[3px] border px-1 text-paper-ink outline-none placeholder:text-paper-ink/45 ${border} ${ring}`}
      />
      {active && problem && (
        <p
          role="alert"
          style={{ left: style.left, top: `calc(${(f.y + f.h) * 100}% + 2px)` }}
          className="absolute z-10 max-w-64 rounded bg-danger px-1.5 py-0.5 text-[11px] leading-snug text-on-color shadow"
        >
          {problem}
        </p>
      )}
    </>
  );
}
