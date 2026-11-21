'use client';

import type {
  Field,
  RecipientInput,
  SendSigningResponse,
  SigningRequestDetailWire,
  UpdateSigningDraftBody,
} from '@lex/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { blankRow, isEmptyRow, rowProblem, toInput, type PersonRow } from '@/lib/people';
import { billingChanged, isLimitError, showUpgrade } from '@/lib/billing';
import { ApiError, documentPdf, getDraft, sendDraft, updateDraft } from '@/lib/signing';
import { usePdf } from '@/lib/use-pdf';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../Icons';
import { FieldEditor } from './FieldEditor';
import { initialMode, RecipientsStep, type RecipientMode } from './RecipientsStep';
import { SendResult } from './SendResult';
import { SendStep } from './SendStep';

const STEPS = [
  { id: 'fields', label: 'Maydonlar' },
  { id: 'people', label: 'Qabul qiluvçilar' },
  { id: 'send', label: 'Yuboriş' },
] as const;
type Step = (typeof STEPS)[number]['id'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Wait this long after the last edit before saving. */
const SAVE_DELAY_MS = 800;

type Patch = Pick<UpdateSigningDraftBody, 'fields' | 'title' | 'message' | 'partyName' | 'recipients'>;

/**
 * Sending one PDF for signature, in three steps: place fields → add people →
 * send; then every link to share. Every change saves itself to the draft.
 */
export function SendFlow({ id }: { id: string }) {
  const [draft, setDraft] = useState<SigningRequestDetailWire | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('fields');
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [mode, setMode] = useState<RecipientMode>('people');
  const [message, setMessage] = useState('');
  const [partyName, setPartyName] = useState('');
  const [save, setSave] = useState<SaveState>('idle');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [result, setResult] = useState<SendSigningResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDraft(id)
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setTitle(d.title);
        setFields(d.fields);
        setMessage(d.message ?? '');
        setPartyName(d.partyName ?? '');
        setMode(initialMode(d));
        setPeople(
          d.recipients.length > 0
            ? d.recipients.map((r) => ({ key: r.id, name: r.name ?? '', channel: r.channel, contact: r.contact ?? '' }))
            : [blankRow()],
        );
      })
      .catch(() => !cancelled && setLoadError('Qoralamani oçib bölmadi.'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const { pdf, error: pdfError } = usePdf(draft ? draft.id : null, () => documentPdf(draft!));

  // Autosave: the latest unsaved patch waits SAVE_DELAY_MS, then goes out.
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return true;
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
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch };
      setSave('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the page with unsaved edits: save them on the way out.
  useEffect(() => () => void flush(), [flush]);

  /** People rows → the draft, once every non-empty row is valid. */
  const savePeople = (rows: PersonRow[]) => {
    const filled = rows.filter((r) => !isEmptyRow(r));
    if (filled.some((r) => rowProblem(r))) return;
    queue({ recipients: filled.map(toInput) as RecipientInput[] });
  };
  const changePeople = (rows: PersonRow[]) => {
    setPeople(rows);
    savePeople(rows);
  };
  /** "Umumiy havola orqali" sends to nobody by name; the typed rows stay here in case they switch back. */
  const changeMode = (next: RecipientMode) => {
    setMode(next);
    if (next === 'link') queue({ recipients: [] });
    else savePeople(people);
  };

  async function send() {
    setSending(true);
    setSendError('');
    try {
      if (!(await flush())) throw new Error('save');
      setResult(await sendDraft(id));
      billingChanged();
    } catch (err) {
      if (isLimitError(err)) showUpgrade(err.message);
      setSendError(err instanceof ApiError ? err.message : 'Yuborib bölmadi. Qaytadan urinib köring.');
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return <Centered text={loadError} />;
  }
  if (!draft) {
    return <Centered text="Yuklanmoqda…" />;
  }
  if (result) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SendResult
          result={result}
          title={title}
          message={message || null}
          detailHref={`/documents/sends/${result.id}`}
        />
      </div>
    );
  }
  if (draft.status !== 'draft') {
    return <Centered text="Bu hujjat allaqaçon yuborilgan." />;
  }

  const hasSignature = fields.some((f) => f.type === 'signature');
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const filledPeople = mode === 'people' ? people.filter((r) => !isEmptyRow(r)) : [];
  const peopleOk =
    mode === 'link' ? draft.openLinkEnabled : filledPeople.length > 0 && !filledPeople.some((r) => rowProblem(r));
  const canNext = step === 'fields' ? hasSignature : peopleOk;

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
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 whitespace-nowrap ${
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

        <div className="flex items-center gap-2">
          {step !== 'fields' && (
            <button type="button" onClick={() => setStep(STEPS[stepIndex - 1].id)} className="btn btn-ghost btn-sm">
              <ChevronLeftIcon className="size-4" />
              Orqaga
            </button>
          )}
          {step !== 'send' && (
            <button
              type="button"
              disabled={!canNext}
              title={
                canNext
                  ? undefined
                  : step === 'fields'
                    ? 'Avval kamida bitta Imzo maydoni qöying'
                    : filledPeople.length === 0
                      ? 'Kamida bitta odam qöşing'
                      : 'Xato kontaktlarni tuzating'
              }
              onClick={async () => {
                if (await flush()) setStep(STEPS[stepIndex + 1].id);
              }}
              className="btn btn-primary btn-sm"
            >
              Keyingi
              <ChevronRightIcon className="size-4" />
            </button>
          )}
        </div>
      </header>

      {step === 'fields' &&
        (pdfError ? (
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
        ))}

      {step === 'people' && (
        <RecipientsStep
          draft={draft}
          mode={mode}
          people={people}
          onMode={changeMode}
          onPeople={changePeople}
          onAccess={setDraft}
        />
      )}

      {step === 'send' && (
        <SendStep
          draft={draft}
          peopleCount={filledPeople.length}
          fieldCount={fields.length}
          title={title}
          message={message}
          partyName={partyName}
          onTitle={(v) => {
            setTitle(v);
            if (v.trim()) queue({ title: v.trim() });
          }}
          onMessage={(v) => {
            setMessage(v);
            queue({ message: v.trim() || null });
          }}
          onPartyName={(v) => {
            setPartyName(v);
            queue({ partyName: v.trim() || null });
          }}
          sending={sending}
          error={sendError}
          onSend={() => void send()}
        />
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
