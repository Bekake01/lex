'use client';

import type { Field, FieldType } from '@lex/contracts';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DEFAULT_OPTIONS,
  FIELD_CATALOG,
  FIELD_GROUPS,
  FIELD_META,
  isChoice,
  type FieldGroup,
} from '@/lib/field-catalog';
import {
  ChevronDownIcon,
  ClipboardIcon,
  CopyIcon,
  PlusIcon,
  RedoIcon,
  SearchIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../Icons';
import { FieldProperties } from './FieldProperties';
import { FIELD_DRAG_TYPE, PdfPage } from './PdfPage';
import { PdfThumbnail } from './PdfThumbnail';

/** A field as the editor holds it: exactly the contract shape. */
export type EditorField = Field;

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
const HISTORY_LIMIT = 60;

/**
 * Place fields on the PDF: drag from the palette (or double-click to drop on
 * page 1), move, resize, select, undo / redo, copy / paste, zoom. Every person
 * fills every field (no per-recipient groups). Ported from tech award's
 * editor; `onChange` gets the whole layout after every edit (the parent saves).
 */
export function FieldEditor({
  pdf,
  pageCount,
  initialFields,
  onChange,
}: {
  pdf: PDFDocumentProxy;
  pageCount: number;
  initialFields: Field[];
  onChange: (fields: Field[]) => void;
}) {
  const [{ fields, past, future }, dispatch] = useReducer(history, initialFields, (f) => ({
    fields: f.map((x) => ({ ...x })),
    past: [],
    future: [],
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<EditorField | null>(null);
  // A phone can't show a whole page at 100%: start it zoomed out there.
  const [zoomIndex, setZoomIndex] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 0 : 2,
  );
  const [query, setQuery] = useState('');
  // Small screens have no room for the palette rail, so it opens as a drawer.
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Tapping a palette item adds the field here (drag-and-drop needs a mouse).
  const [activePage, setActivePage] = useState(1);

  // Tell the parent after every change (not on the first render).
  const first = useRef(true);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current(fields);
  }, [fields]);

  const commit = useCallback(
    (update: (prev: EditorField[]) => EditorField[]) => dispatch({ type: 'commit', update }),
    [],
  );
  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
    setSelectedId(null);
  }, []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  const addField = useCallback(
    (type: FieldType, page: number, x: number, y: number) => {
      const meta = FIELD_META[type];
      const id = crypto.randomUUID();
      commit((prev) => [
        ...prev,
        {
          id,
          type,
          page,
          x: Math.min(1 - meta.w, Math.max(0, x)),
          y: Math.min(1 - meta.h, Math.max(0, y)),
          w: meta.w,
          h: meta.h,
          required: type !== 'checkbox',
          ...(isChoice(type) ? { options: [...DEFAULT_OPTIONS] } : {}),
        },
      ]);
      setSelectedId(id);
    },
    [commit],
  );

  const changeField = useCallback((id: string, patch: Partial<EditorField>) => {
    const update = (prev: EditorField[]) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
    // Drags fire continuously and must not each become an undo step: the
    // gesture took one snapshot when it started (beginGesture).
    const geometryOnly = Object.keys(patch).every((k) => ['x', 'y', 'w', 'h'].includes(k));
    dispatch({ type: geometryOnly ? 'set' : 'commit', update });
  }, []);

  /** A move / resize gesture starts: one history entry for the whole drag. */
  const beginGesture = useCallback(() => dispatch({ type: 'snapshot' }), []);

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  const deleteSelected = useCallback(() => {
    if (selectedId) commit((prev) => prev.filter((f) => f.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, commit]);

  const copySelected = useCallback(() => {
    if (selected) setClipboard(selected);
  }, [selected]);

  const paste = useCallback(() => {
    const src = clipboard;
    if (!src) return;
    const id = crypto.randomUUID();
    // Offset so the copy is visibly distinct from its original.
    commit((prev) => [
      ...prev,
      { ...src, id, x: Math.min(1 - src.w, src.x + 0.02), y: Math.min(1 - src.h, src.y + 0.02) },
    ]);
    setSelectedId(id);
  }, [clipboard, commit]);

  // Shortcuts work anywhere EXCEPT while typing into a form control.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'c') {
        copySelected();
      } else if (mod && key === 'v') {
        paste();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, copySelected, paste, deleteSelected, selectedId]);

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);
  const palette = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELD_CATALOG.filter((f) => !q || f.label.toLowerCase().includes(q));
  }, [query]);

  /** Palette search + groups, shared by the desktop rail and the drawer. */
  const paletteBody = (
    <>
        <div className="px-4 pt-4">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-muted focus-within:border-accent">
            <SearchIcon className="size-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Maydon qidiriş"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </label>
        </div>

        <div className="px-4 pt-4 pb-6">
          {FIELD_GROUPS.map((group) => {
            const items = palette.filter((f) => f.group === group);
            if (items.length === 0) return null;
            return (
              <PaletteGroup key={group} group={group}>
                {items.map((f) => (
                  <button
                    key={f.type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(FIELD_DRAG_TYPE, f.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => addField(f.type, activePage, 0.4, 0.4)}
                    onClick={() => {
                      // Touch has no drag-and-drop: one tap drops the field on
                      // the open page, and the drawer gets out of the way.
                      if (!paletteOpen) return;
                      addField(f.type, activePage, 0.4, 0.4);
                      setPaletteOpen(false);
                    }}
                    title={`${f.label}: hujjatga sudrang (ikki marta bosilsa ${activePage}-sahifaga qöyiladi)`}
                    className="flex cursor-grab items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft active:cursor-grabbing"
                  >
                    <span className="shrink-0 text-accent">{f.icon}</span>
                    <span className="min-w-0 truncate">{f.label}</span>
                  </button>
                ))}
              </PaletteGroup>
            );
          })}
          {palette.length === 0 && <p className="py-6 text-center text-sm text-muted">Bunday maydon yöq.</p>}
          <p className="mt-2 text-xs text-faint">
            {paletteOpen ? `Bosing — maydon ${activePage}-sahifaga qöyiladi. ` : ''}
            Har bir odam şu maydonlarning hammasini öz nusxasida töldiradi.
          </p>
        </div>
    </>
  );

  const properties = selected && (
    <FieldProperties
      field={selected}
      onChange={(patch) => changeField(selected.id, patch)}
      onDelete={deleteSelected}
      onClose={() => setSelectedId(null)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: palette, and the selected field's properties on top of it. */}
      <aside className="hidden w-[264px] shrink-0 flex-col overflow-y-auto border-r border-line bg-page md:flex">
        {properties && <div className="border-b border-line bg-subtle/50">{properties}</div>}
        {paletteBody}
      </aside>

      {/* Small screens: the same palette as a drawer over the page. */}
      {paletteOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Yopiş"
            onClick={() => setPaletteOpen(false)}
            className="animate-fade-in absolute inset-0 bg-overlay"
          />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 flex w-[300px] max-w-[88vw] flex-col overflow-y-auto border-r border-line bg-page">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
              <span className="font-medium">Maydonlar</span>
              <button type="button" onClick={() => setPaletteOpen(false)} aria-label="Yopiş" className="btn btn-ghost btn-icon btn-sm">
                <XIcon className="size-4" />
              </button>
            </div>
            {paletteBody}
          </div>
        </div>
      )}

      {/* Centre: toolbar + pages. */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-page px-2 sm:px-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="btn btn-soft btn-sm mr-1 shrink-0 md:hidden"
          >
            <PlusIcon className="size-4" /> Maydon
          </button>
          <ToolButton label="Bekor qiliş (⌘Z)" onClick={undo} disabled={past.length === 0}>
            <UndoIcon className="size-4" />
          </ToolButton>
          <ToolButton label="Qaytariş (⌘⇧Z)" onClick={redo} disabled={future.length === 0}>
            <RedoIcon className="size-4" />
          </ToolButton>
          <span className="mx-1.5 h-5 w-px shrink-0 bg-line" />
          <ToolButton label="Nusxalaş (⌘C)" onClick={copySelected} disabled={!selected}>
            <CopyIcon className="size-4" />
          </ToolButton>
          <ToolButton label="Qöyiş (⌘V)" onClick={paste} disabled={!clipboard}>
            <ClipboardIcon className="size-4" />
          </ToolButton>
          <ToolButton label="Öçiriş (Delete)" onClick={deleteSelected} disabled={!selected}>
            <TrashIcon className="size-4" />
          </ToolButton>
          <span className="mx-1.5 h-5 w-px shrink-0 bg-line" />
          <ToolButton label="Kiçraytiriş" onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} disabled={zoomIndex === 0}>
            <ZoomOutIcon className="size-4" />
          </ToolButton>
          <span className="w-12 shrink-0 text-center text-sm tabular-nums text-muted">{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
          <ToolButton
            label="Kattalaştiriş"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
          >
            <ZoomInIcon className="size-4" />
          </ToolButton>
          <span className="ml-auto hidden shrink-0 pl-3 text-sm text-muted sm:inline">{fields.length} ta maydon</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-subtle p-3 sm:p-8">
          <div className="mx-auto flex w-fit flex-col items-center gap-6">
            {pages.map((p) => (
              <div key={p} id={`page-${p}`} className="flex flex-col items-center gap-2">
                <div onPointerDownCapture={(e) => {
                  setActivePage(p);
                  // A press on an existing box starts a drag: snapshot first.
                  if ((e.target as HTMLElement).closest('[data-page-overlay] > div')) beginGesture();
                }}>
                  <PdfPage
                    pdf={pdf}
                    pageNumber={p}
                    scale={ZOOM_STEPS[zoomIndex]}
                    fields={fields.filter((f) => f.page === p)}
                    selectedId={selectedId}
                    onDropField={(type, x, y) => addField(type, p, x, y)}
                    onSelect={setSelectedId}
                    onChangeField={changeField}
                  />
                </div>
                <span className="text-sm text-muted">{p}-sahifa</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Small screens: the selected field's properties as a bottom sheet. */}
      {properties && (
        <div className="animate-slide-up fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto border-t border-line bg-page shadow-[0_-8px_30px_var(--shadow)] md:hidden">
          {properties}
        </div>
      )}

      {/* Right: page map with a per-page field tally. */}
      <aside className="hidden w-[200px] shrink-0 overflow-y-auto border-l border-line bg-page p-4 xl:block">
        <p className="mb-3 text-sm text-muted">{pageCount} sahifa</p>
        <div className="flex flex-col gap-4">
          {pages.map((p) => {
            const count = fields.filter((f) => f.page === p).length;
            return (
              <div key={p}>
                <button
                  type="button"
                  onClick={() => document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' })}
                  className="block w-full cursor-pointer overflow-hidden rounded-md border-2 border-line transition-colors hover:border-accent"
                >
                  <PdfThumbnail pdf={pdf} page={p} width={160} />
                </button>
                <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-muted">
                  <span>{p}</span>
                  <span>{count > 0 ? `${count} ta maydon` : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="btn btn-ghost btn-icon btn-sm shrink-0">
      {children}
    </button>
  );
}

function PaletteGroup({ group, children }: { group: FieldGroup; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-2 flex w-full cursor-pointer items-center gap-1.5 text-left"
      >
        <ChevronDownIcon className={`size-4 text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-sm font-medium">{group}</span>
      </button>
      {open && <div className="grid grid-cols-2 gap-2">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ history -- */

interface History {
  fields: EditorField[];
  past: EditorField[][];
  future: EditorField[][];
}

type HistoryAction =
  | { type: 'commit'; update: (prev: EditorField[]) => EditorField[] }
  | { type: 'set'; update: (prev: EditorField[]) => EditorField[] }
  | { type: 'snapshot' }
  | { type: 'undo' }
  | { type: 'redo' };

/** Undo / redo over whole layouts: snapshots are small, and one value keeps multi-field edits atomic. */
function history(state: History, action: HistoryAction): History {
  const pushed = () => [...state.past.slice(-HISTORY_LIMIT), state.fields];
  switch (action.type) {
    case 'commit':
      return { fields: action.update(state.fields), past: pushed(), future: [] };
    case 'set':
      return { ...state, fields: action.update(state.fields) };
    case 'snapshot':
      return { ...state, past: pushed(), future: [] };
    case 'undo': {
      const last = state.past.at(-1);
      if (!last) return state;
      return { fields: last, past: state.past.slice(0, -1), future: [state.fields, ...state.future] };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { fields: next, past: [...state.past, state.fields], future: rest };
    }
  }
}
