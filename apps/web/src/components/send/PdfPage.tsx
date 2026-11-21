'use client';

import type { FieldType } from '@lex/contracts';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { FIELD_META } from '@/lib/field-catalog';
import type { EditorField } from './FieldEditor';

/** Smallest a field may be dragged, as a fraction of the page. */
const MIN_W = 0.02;
const MIN_H = 0.012;

/** The drag payload a palette button carries. */
export const FIELD_DRAG_TYPE = 'application/x-lex-field';

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number; // 1-based
  scale: number;
  fields: EditorField[]; // fields on THIS page
  selectedId: string | null;
  onDropField: (type: FieldType, xFrac: number, yFrac: number) => void;
  onSelect: (id: string | null) => void;
  onChangeField: (id: string, patch: Partial<EditorField>) => void;
}

/**
 * One rendered PDF page (pdf.js → canvas) with an absolute overlay for fields.
 * Field coordinates are normalized (0..1, top-left) so they survive any zoom,
 * and the stamper reads the same numbers when it burns them into the copy.
 * pdf.js lays the page out as DISPLAYED (rotation applied), which is the same
 * space the fields are measured in.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  fields,
  selectedId,
  onDropField,
  onSelect,
  onChangeField,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Device pixels for a sharp page; CSS size stays the viewport size.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ w: viewport.width, h: viewport.height });
      await page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div
      className="relative bg-surface shadow-[0_4px_20px_var(--shadow)] ring-1 ring-line"
      style={{ width: size?.w, height: size?.h }}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        data-page-overlay
        className="absolute inset-0"
        onPointerDown={(e) => {
          // A click / tap on bare page area clears the selection.
          if (e.target === e.currentTarget) onSelect(null);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData(FIELD_DRAG_TYPE) as FieldType;
          const meta = FIELD_META[type];
          if (!meta) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          // The drop point is where the cursor is; centre the field on it.
          onDropField(type, x - meta.w / 2, y - meta.h / 2);
        }}
      >
        {fields.map((f) => (
          <FieldBox
            key={f.id}
            field={f}
            selected={f.id === selectedId}
            onSelect={() => onSelect(f.id)}
            onChange={(patch) => onChangeField(f.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldBox({
  field,
  selected,
  onSelect,
  onChange,
}: {
  field: EditorField;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EditorField>) => void;
}) {
  const meta = FIELD_META[field.type];
  // One accent for every box; the signature family a little stronger.
  const strong = meta.family === 'mark';

  /**
   * One pointer gesture for both moving and resizing, so a finger on a phone
   * drags a box exactly like a mouse does (`touch-action: none` below stops
   * the page scrolling under the drag). The overlay is measured when the drag
   * STARTS, so a page re-rendered at a new zoom can't leave stale pixel maths
   * behind.
   */
  function startGesture(e: React.PointerEvent, mode: 'move' | 'resize') {
    // Secondary mouse buttons shouldn't start a drag.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();

    const overlay = (e.currentTarget as HTMLElement).closest('[data-page-overlay]');
    if (!overlay) return;
    const bounds = overlay.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: field.x, y: field.y, w: field.w, h: field.h };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = (ev.clientX - startX) / bounds.width;
      const dy = (ev.clientY - startY) / bounds.height;
      if (mode === 'move') {
        onChange({
          x: clamp(origin.x + dx, 0, 1 - origin.w),
          y: clamp(origin.y + dy, 0, 1 - origin.h),
        });
      } else {
        onChange({
          w: clamp(origin.w + dx, MIN_W, 1 - origin.x),
          h: clamp(origin.h + dy, MIN_H, 1 - origin.y),
        });
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return (
    <div
      onPointerDown={(e) => startGesture(e, 'move')}
      title={`${meta.label}${field.required ? ' (majburiy)' : ''}`}
      className={`absolute touch-none cursor-move rounded-[3px] ${strong ? 'border-2' : 'border'} border-accent`}
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.w * 100}%`,
        height: `${field.h * 100}%`,
        background: `color-mix(in srgb, var(--accent) ${strong ? 22 : 12}%, transparent)`,
        outline: selected ? '2px solid var(--accent)' : undefined,
        outlineOffset: 2,
      }}
    >
      {field.type !== 'checkbox' && (
        <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1 text-[10px] leading-none font-semibold whitespace-nowrap text-accent">
          {meta.hint ?? meta.label}
        </span>
      )}

      {/* Which boxes the person can't skip, at a glance. */}
      {field.required && meta.family === 'input' && (
        <span
          aria-hidden
          title="Majburiy"
          className="pointer-events-none absolute -top-1 -right-1 size-2 rounded-full bg-accent"
        />
      )}

      {selected && (
        <span
          onPointerDown={(e) => startGesture(e, 'resize')}
          role="presentation"
          className="absolute -right-3 -bottom-3 grid size-6 touch-none cursor-se-resize place-items-center"
        >
          <span className="size-3 rounded-sm border border-surface bg-accent" />
        </span>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
