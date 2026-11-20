'use client';

import type { Field, SigningRequestDetailWire } from '@lex/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { documentPdf, getDraft, updateDraft } from '@/lib/signing';
import { usePdf } from '@/lib/use-pdf';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../Icons';
import { FieldEditor } from './FieldEditor';

const STEPS = [
  { id: 'fields', label: 'Maydonlar' },
  { id: 'people', label: 'Odamlar' },
  { id: 'send', label: 'Yuboriş' },
] as const;
type Step = (typeof STEPS)[number]['id'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Wait this long after the last edit before saving. */
const SAVE_DELAY_MS = 800;

/**
 * Sending one PDF for signature, in three steps: place fields → add people →
 * send. Step 1 (this phase) is the field editor; changes save themselves.
 */
export function SendFlow({ id }: { id: string }) {
  const [draft, setDraft] = useState<SigningRequestDetailWire | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('fields');
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [save, setSave] = useState<SaveState>('idle');

  useEffect(() => {
    let cancelled = false;
    getDraft(id)
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setTitle(d.title);
        setFields(d.fields);
      })
      .catch(() => !cancelled && setLoadError('Qoralamani oçib bölmadi.'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const { pdf, error: pdfError } = usePdf(draft ? draft.id : null, () => documentPdf(draft!));

  // Autosave: the latest unsaved patch waits SAVE_DELAY_MS, then goes out.
  const pending = useRef<{ fields?: Field[]; title?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (patch.fields === undefined && patch.title === undefined) return true;
    pending.current = {};
    setSave('saving');
    try {
      await updateDraft(id, patch);
      setSave('saved');
      return true;
    } catch {
      // Put it back, so the next edit (or "Keyingi") retries it.
      pending.current = { ...patch, ...pending.current };
      setSave('error');
      return false;
    }
  }, [id]);

  const queue = useCallback(
    (patch: { fields?: Field[]; title?: string }) => {
      pending.current = { ...pending.current, ...patch };
      setSave('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the page with unsaved edits: save them on the way out.
  useEffect(() => () => void flush(), [flush]);

  if (loadError) {
    return <Centered text={loadError} />;
  }
  if (!draft) {
    return <Centered text="Yuklanmoqda…" />;
  }
  if (draft.status !== 'draft') {
    return <Centered text="Bu hujjat allaqaçon yuborilgan." />;
  }

  const hasSignature = fields.some((f) => f.type === 'signature');
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-page px-3 sm:px-4">
        <Link href="/contracts" aria-label="Hujjatlarga qaytiş" className="btn btn-ghost btn-icon btn-sm">
          <ChevronLeftIcon className="size-4" />
        </Link>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) queue({ title: e.target.value.trim() });
          }}
          aria-label="Hujjat nomi"
          className="hidden max-w-[220px] min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 font-medium hover:border-line focus:border-accent focus:outline-none md:block"
        />

        <nav aria-label="Qadamlar" className="mx-auto flex items-center gap-1.5 text-sm">
          {STEPS.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRightIcon className="size-3.5 text-faint" />}
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                  i === stepIndex ? 'bg-accent-soft font-medium text-accent' : i < stepIndex ? 'text-ink' : 'text-muted'
                }`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full text-xs ${
                    i === stepIndex ? 'bg-accent text-on-color' : i < stepIndex ? 'bg-ink text-page' : 'bg-subtle'
                  }`}
                >
                  {i < stepIndex ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                {s.label}
              </span>
            </span>
          ))}
        </nav>

        <span className="hidden w-28 text-right text-sm sm:block" aria-live="polite">
          {save === 'saving' && <span className="text-muted">Saqlanmoqda…</span>}
          {save === 'saved' && <span className="text-success">Saqlandi</span>}
          {save === 'error' && <span className="text-danger">Saqlanmadi</span>}
        </span>

        {step === 'fields' ? (
          <button
            type="button"
            disabled={!hasSignature}
            title={hasSignature ? undefined : 'Avval kamida bitta Imzo maydoni qöying'}
            onClick={async () => {
              if (await flush()) setStep('people');
            }}
            className="btn btn-primary btn-sm"
          >
            Keyingi
            <ChevronRightIcon className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={() => setStep('fields')} className="btn btn-secondary btn-sm">
            <ChevronLeftIcon className="size-4" />
            Orqaga
          </button>
        )}
      </header>

      {step === 'fields' ? (
        pdfError ? (
          <Centered text={pdfError} />
        ) : !pdf ? (
          <Centered text="Hujjat yuklanmoqda…" />
        ) : (
          <FieldEditor
            pdf={pdf}
            pageCount={draft.pageCount}
            initialFields={fields}
            onChange={(next) => {
              setFields(next);
              queue({ fields: next });
            }}
          />
        )
      ) : (
        // Odamlar and Yuboriş come in the next phase (09).
        <Centered text={`${STEPS[stepIndex].label} — tez orada.`} />
      )}
    </div>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
