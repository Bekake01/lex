'use client';

import { useState } from 'react';
import { AI_ERROR_CODES, type AcceptEditsResponse, type EditWire } from '@lex/contracts';
import { acceptEdits, ApiError, errorText, rejectEdits } from '@/lib/review';
import { CheckIcon, ExternalIcon, ScaleIcon, XIcon } from '../Icons';
import { clauseLabel } from './ReviewFindings';

/**
 * Accepting and rejecting the AI's proposed edits (`POST /reviews/:id/edits/accept|reject`).
 * Accepting writes version + 1 of the Word file and starts its review; the
 * caller moves to it in `onAccepted`.
 */
export function useEditDecisions({
  reviewId,
  docx,
  latest,
  onChanged,
  onAccepted,
}: {
  reviewId: string | null;
  /** Edits only apply to Word files. */
  docx: boolean;
  /** Old versions are read-only. */
  latest: boolean;
  /** Reload the chat (edit statuses changed). */
  onChanged: () => void;
  onAccepted: (created: AcceptEditsResponse) => void;
}) {
  const [busy, setBusy] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<{ ids: string[]; text: string } | null>(null);

  async function decide(ids: string[], accept: boolean) {
    if (!reviewId || busy || ids.length === 0) return;
    setBusy(ids);
    setProblem(null);
    try {
      if (accept) onAccepted(await acceptEdits(reviewId, ids));
      else {
        await rejectEdits(reviewId, ids);
        onChanged();
      }
    } catch (err) {
      setProblem({ ids, text: decisionErrorText(err) });
      if (err instanceof ApiError && err.status === 409) onChanged();
    } finally {
      setBusy(null);
    }
  }

  return {
    canDecide: docx && latest,
    docx,
    latest,
    busy,
    problem,
    accept: (ids: string[]) => decide(ids, true),
    reject: (ids: string[]) => decide(ids, false),
  };
}

export type EditDecisions = ReturnType<typeof useEditDecisions>;

/** The API's messages are English; each known code gets an Uzbek line. */
function decisionErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Tarmoq xatosi. Qayta urinib köring.';
  if (err.code === AI_ERROR_CODES.editsNeedDocx) {
    return 'Tuzatişlar faqat Word (DOCX) faylga kiritiladi. Taklif qilingan matnni nusxalab, hujjatga özingiz qöying.';
  }
  if (err.code === AI_ERROR_CODES.editNotApplicable) {
    return 'Hujjat bu taklifdan keyin özgargan, şuning uçun uni kiritib bölmadi. Yangi taklif sörang.';
  }
  if (err.code === AI_ERROR_CODES.editsNotAvailable) {
    return 'Word faylga özgartiriş kiritiş hali işlamaydi. Taklif matni şu yerda qoladi.';
  }
  if (err.status === 409) return 'Bu tuzatiş allaqaçon hal qilingan.';
  return errorText(err, 'Tuzatişni saqlab bölmadi. Qayta urinib köring.');
}

/** "Hammasini qabul qiliş" for a message with several proposed edits. */
export function AcceptAll({ edits, decisions }: { edits: EditWire[]; decisions: EditDecisions }) {
  const ids = edits.filter((e) => e.status === 'proposed').map((e) => e.id);
  if (ids.length < 2 || !decisions.canDecide) return null;
  const busy = decisions.busy !== null;
  const failed = decisions.problem && decisions.problem.ids.length > 1 && ids.every((id) => decisions.problem!.ids.includes(id));
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button onClick={() => void decisions.accept(ids)} disabled={busy} className="btn btn-primary btn-sm">
        <CheckIcon className="size-3.5" /> Hammasini qabul qiliş ({ids.length})
      </button>
      {failed && <p className="text-xs text-danger">{decisions.problem!.text}</p>}
    </div>
  );
}

/** One proposed edit: original → replacement, the reason and law, and the decision. */
export function EditCard({ edit, decisions }: { edit: EditWire; decisions: EditDecisions }) {
  const [copied, setCopied] = useState(false);
  const proposed = edit.status === 'proposed';
  const busy = decisions.busy?.includes(edit.id) ?? false;
  const problem = decisions.problem?.ids.length === 1 && decisions.problem.ids[0] === edit.id ? decisions.problem.text : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(edit.replacement);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is on screen to select by hand */
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface text-sm">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">{clauseLabel(edit.clauseRef)}</span>
        <span className="text-xs text-muted">Tuzatiş taklifi</span>
        {edit.status === 'accepted' && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">
            <CheckIcon className="size-3" /> Qabul qilindi
          </span>
        )}
        {edit.status === 'rejected' && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
            <XIcon className="size-3" /> Rad etildi
          </span>
        )}
      </div>

      <div className={`space-y-2 px-4 py-3 font-doc text-[15px] leading-relaxed ${edit.status === 'rejected' ? 'opacity-60' : ''}`}>
        <p className="text-faint line-through decoration-danger/50">{edit.original}</p>
        <p className={edit.status === 'rejected' ? 'text-ink/70' : 'text-success'}>{edit.replacement}</p>
      </div>

      {(edit.reason || edit.citation) && (
        <div className="space-y-2 border-t border-line px-4 py-2.5 text-xs text-muted">
          {edit.reason && <p>{edit.reason}</p>}
          {edit.citation && (
            <a
              href={edit.citation.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 hover:text-accent"
            >
              <ScaleIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {edit.citation.actTitle}
                {edit.citation.articleNumber && `, ${edit.citation.articleNumber}-modda`}
              </span>
              <ExternalIcon className="size-3 shrink-0" />
            </a>
          )}
        </div>
      )}

      {proposed && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-page/60 px-4 py-2.5">
          {decisions.canDecide ? (
            <>
              <button
                onClick={() => void decisions.accept([edit.id])}
                disabled={decisions.busy !== null}
                className="btn btn-primary btn-sm"
              >
                <CheckIcon className="size-3.5" /> {busy ? 'Saqlanmoqda…' : 'Qabul qiliş'}
              </button>
              <button
                onClick={() => void decisions.reject([edit.id])}
                disabled={decisions.busy !== null}
                className="btn btn-ghost btn-sm"
              >
                Rad etiş
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-xs text-muted">
                {!decisions.latest
                  ? 'Bu eski versiya: faqat körish uçun.'
                  : 'Tuzatişlar faqat Word (DOCX) faylga kiritiladi. Matnni nusxalab, hujjatga özingiz qöying.'}
              </span>
              <button onClick={() => void copy()} className="btn btn-secondary btn-sm">
                {copied ? 'Nusxalandi' : 'Matnni nusxalaş'}
              </button>
            </>
          )}
          {problem && <p className="w-full text-xs text-danger">{problem}</p>}
        </div>
      )}
    </div>
  );
}
