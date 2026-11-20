'use client';

import {
  SIGNING_ERROR_CODES,
  SIGNING_ROUTES,
  fieldValueProblem,
  type Field,
  type RecipientSummaryWire,
  type SignerView,
  type SignerViewResponse,
  type UnlockResponse,
} from '@lex/contracts';
import { useEffect, useMemo, useState } from 'react';
import { blockingFields, fieldDone, fieldKind, sortFields, submittedValues } from '@/lib/sign-fields';
import { SignApiError, saveTicket, signFetch, signJson } from '@/lib/sign-api';
import { usePdf } from '@/lib/use-pdf';
import { ArrowDownIcon, CheckIcon, ChevronRightIcon, PenIcon } from '../Icons';
import { AdoptSignature, type AdoptedSignature } from './AdoptSignature';
import { Ceremony, fieldElementId } from './Ceremony';
import { Completion } from './Completion';
import { InvalidLink, Loading, PasswordGate, Spinner } from './States';
import { Card, Label, SummaryStep } from './SummaryStep';

/**
 * `/sign/<token>`: Parol (if set) → Xulosa (if there is a summary) → Hujjat
 * (fill the fields on the PDF) → Imzo (name, signature, consent) → Tayyor.
 * Talks only to `/api/sign/...` (this app's pass-through).
 */
type Phase =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'locked'; title: string }
  | { kind: 'ready'; view: SignerView; summary: RecipientSummaryWire | null }
  | { kind: 'done'; view: SignerView; justSigned: boolean };

type Step = 'summary' | 'document' | 'sign';
const STEP_LABEL: Record<Step, string> = { summary: 'Xulosa', document: 'Hujjat', sign: 'Imzo' };

/** Where a link stands right now: one `GET /sign/:token` (+ the summary). */
async function fetchPhase(token: string): Promise<Phase> {
  try {
    const res = await signJson<SignerViewResponse>(SIGNING_ROUTES.sign(token), token);
    if ('locked' in res) return { kind: 'locked', title: res.title };
    if (res.cancelled) return { kind: 'invalid' };
    if (res.signed) return { kind: 'done', view: res, justSigned: false };
    // No summary is not a reason to stop: the step is just skipped.
    const summary = res.hasSummary
      ? await signJson<RecipientSummaryWire>(SIGNING_ROUTES.signSummary(token), token).catch(() => null)
      : null;
    return { kind: 'ready', view: res, summary };
  } catch {
    return { kind: 'invalid' };
  }
}

export function SigningFlow({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchPhase(token).then((p) => !cancelled && setPhase(p));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const reload = async () => setPhase(await fetchPhase(token));

  async function unlock(password: string) {
    try {
      const { ticket } = await signJson<UnlockResponse>(SIGNING_ROUTES.signUnlock(token), token, {
        method: 'POST',
        body: { password },
      });
      saveTicket(token, ticket);
    } catch (err) {
      if (err instanceof SignApiError && err.code === SIGNING_ERROR_CODES.wrongPassword) {
        throw new Error('Parol notoğri');
      }
      if (err instanceof SignApiError && err.code === SIGNING_ERROR_CODES.locked) {
        throw new Error('Juda köp uriniş — yuboruvçiga murojaat qiling');
      }
      throw new Error('Tekşirib bölmadi. Qayta urinib köring.');
    }
    await reload();
  }

  switch (phase.kind) {
    case 'loading':
      return <Loading />;
    case 'invalid':
      return <InvalidLink />;
    case 'locked':
      return <PasswordGate title={phase.title} onSubmit={unlock} />;
    case 'done':
      return (
        <Completion
          token={token}
          title={phase.view.title}
          senderName={phase.view.senderName}
          justSigned={phase.justSigned}
        />
      );
    case 'ready':
      return (
        <Form
          token={token}
          view={phase.view}
          summary={phase.summary}
          onSigned={() => setPhase({ kind: 'done', view: phase.view, justSigned: true })}
          onInvalid={() => void reload()}
        />
      );
  }
}

function Form({
  token,
  view,
  summary,
  onSigned,
  onInvalid,
}: {
  token: string;
  view: SignerView;
  summary: RecipientSummaryWire | null;
  onSigned: () => void;
  /** Submit was refused: reload, which shows the done screen or "Havola yaroqsiz". */
  onInvalid: () => void;
}) {
  const steps: Step[] = summary ? ['summary', 'document', 'sign'] : ['document', 'sign'];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex]!;

  const fields = useMemo(() => sortFields(view.fields), [view.fields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<AdoptedSignature | null>(null);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [signerName, setSignerName] = useState(view.recipientName ?? '');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Start loading the PDF at once, while the person reads the summary.
  const { pdf, error: pdfError } = usePdf(token, async () => {
    const res = await signFetch(SIGNING_ROUTES.signDocument(token), token);
    return res.arrayBuffer();
  });

  const actionable = fields.filter((f) => fieldKind(f) !== 'auto');
  const doneCount = actionable.filter((f) => fieldDone(f, values, signature !== null)).length;
  const blocking = blockingFields(fields, values, signature !== null);

  const nameProblem = signerName.trim() ? fieldValueProblem('name', signerName) : 'Ismingizni yozing';
  const canSign = blocking.length === 0 && signature !== null && agree && nameProblem === null && !submitting;

  function goTo(field: Field) {
    setActiveId(field.id);
    const el = document.getElementById(fieldElementId(field));
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus after the scroll starts; a mark field opens the signature dialog.
    if (fieldKind(field) === 'mark') {
      if (!signature) setAdoptOpen(true);
    } else {
      setTimeout(() => (el instanceof HTMLElement ? el : null)?.focus({ preventScroll: true }), 350);
    }
  }

  function next() {
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (!canSign || !signature) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await signFetch(SIGNING_ROUTES.signSubmit(token), token, {
        method: 'POST',
        body: {
          signerName: signerName.trim(),
          signature: { method: signature.method, image: signature.dataUrl },
          fieldValues: submittedValues(fields, values),
          agreed: true,
        },
      });
      onSigned();
    } catch (err) {
      setSubmitting(false);
      if (err instanceof SignApiError && err.status === 404) return onInvalid();
      setSubmitError('Imzolab bölmadi. Internetni tekşirib, qayta urinib köring.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-5 sm:py-10">
      {/* Intro */}
      <div className="animate-fade-up">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{view.senderName}</span> sizga imzolaş uçun hujjat yubordi
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-4xl">{view.title}</h1>
        {view.message && (
          <p className="mt-4 rounded-xl border-l-[3px] border-accent bg-surface px-4 py-3 text-[15px] whitespace-pre-line text-ink/85 italic">
            “{view.message}”
          </p>
        )}
      </div>

      {/* Stepper */}
      <ol className="mt-7 flex items-center gap-2">
        {[...steps.map((s) => STEP_LABEL[s]), 'Tayyor'].map((label, i, all) => (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              onClick={() => i < stepIndex && setStepIndex(i)}
              className={`flex items-center gap-2 text-sm ${i <= stepIndex ? 'text-ink' : 'text-faint'} ${
                i < stepIndex ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-semibold transition ${
                  i < stepIndex ? 'bg-success text-on-color' : i === stepIndex ? 'bg-accent text-on-color' : 'bg-subtle text-muted'
                }`}
              >
                {i < stepIndex ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span className={i === stepIndex ? 'inline' : 'hidden sm:inline'}>{label}</span>
            </button>
            {i < all.length - 1 && <span className={`h-px flex-1 ${i < stepIndex ? 'bg-success' : 'bg-line'}`} />}
          </li>
        ))}
      </ol>

      <div key={step} className="mt-6 animate-fade-up">
        {step === 'summary' && summary && <SummaryStep summary={summary} />}

        {step === 'document' && (
          <div>
            {/* Progress + next field, sticky so it stays in reach on a phone. */}
            <div className="frost sticky top-2 z-20 mb-4 flex items-center gap-3 rounded-xl px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {blocking.length === 0 ? 'Hammasi töldirildi' : `${doneCount} / ${actionable.length} töldirildi`}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${actionable.length ? (doneCount / actionable.length) * 100 : 100}%` }}
                  />
                </div>
              </div>
              {blocking.length > 0 && (
                <button onClick={() => goTo(blocking[0]!)} className="btn btn-soft btn-sm shrink-0">
                  <ArrowDownIcon className="size-3.5" /> Keyingi maydon
                </button>
              )}
            </div>

            {pdfError ? (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{pdfError}</p>
            ) : pdf ? (
              <Ceremony
                pdf={pdf}
                fields={fields}
                values={values}
                signature={signature?.dataUrl ?? null}
                activeId={activeId}
                onActive={setActiveId}
                onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
                onMarkClick={() => setAdoptOpen(true)}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
                <Spinner /> Hujjat yuklanmoqda…
              </div>
            )}
          </div>
        )}

        {step === 'sign' && (
          <Card>
            <Label>Imzo</Label>
            <label className="mt-4 block">
              <span className="text-xs text-muted">Töliq ismingiz</span>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Familiya Ism"
                maxLength={100}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2.5 outline-none placeholder:text-faint focus:border-accent/50 focus:bg-surface"
              />
              {signerName.trim() && nameProblem && <span className="mt-1 block text-xs text-danger">{nameProblem}</span>}
            </label>

            <div className="mt-4">
              <span className="text-xs text-muted">Imzongiz</span>
              <button
                type="button"
                onClick={() => setAdoptOpen(true)}
                className="mt-1 flex h-28 w-full items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper transition hover:border-accent/50"
              >
                {signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signature.dataUrl} alt="Imzongiz" className="max-h-24 max-w-[80%] object-contain" />
                ) : (
                  <span className="flex items-center gap-2 text-sm text-accent">
                    <PenIcon className="size-4" /> Imzo qöyiş
                  </span>
                )}
              </button>
              {signature && (
                <button onClick={() => setAdoptOpen(true)} className="btn btn-ghost btn-sm mt-1">
                  Özgartiriş
                </button>
              )}
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-page p-4 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span>
                Elektron imzolaşga roziman. Hujjat matni bilan tanişdim; uşbu elektron imzo qölda qöyilgan imzo bilan teng
                kuçga ega.
              </span>
            </label>

            {blocking.length > 0 && (
              <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                Hujjatda {blocking.length} ta maydon töldirilmagan.{' '}
                <button onClick={() => setStepIndex(steps.indexOf('document'))} className="font-medium underline">
                  Hujjatga qaytiş
                </button>
              </p>
            )}
            {submitError && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{submitError}</p>}
          </Card>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-6 flex items-center gap-2">
        {stepIndex > 0 && (
          <button onClick={() => setStepIndex(stepIndex - 1)} className="btn btn-ghost">
            Orqaga
          </button>
        )}
        <div className="ml-auto">
          {step === 'sign' ? (
            <button onClick={() => void submit()} disabled={!canSign} className="btn btn-primary px-5">
              {submitting ? <Spinner light /> : <PenIcon className="size-4" />}
              {submitting ? 'Imzolanmoqda…' : 'Imzolaş'}
            </button>
          ) : step === 'document' && blocking.length > 0 ? (
            <button onClick={() => goTo(blocking[0]!)} className="btn btn-primary px-5">
              Keyingi maydon <ArrowDownIcon className="size-4" />
            </button>
          ) : (
            <button onClick={next} disabled={step === 'document' && !pdf} className="btn btn-primary px-5">
              Davom etiş <ChevronRightIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {adoptOpen && (
        <AdoptSignature
          defaultName={signerName || view.recipientName || ''}
          onAdopt={(sig) => {
            setSignature(sig);
            setAdoptOpen(false);
          }}
          onClose={() => setAdoptOpen(false)}
        />
      )}
    </div>
  );
}
