'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocumentTextWire, IssueWire } from '@lex/contracts';
import { buildBlocks } from '@/lib/clause-blocks';
import { severityMeta } from '@/lib/demo';
import { errorText, getDocumentFile, getDocumentText } from '@/lib/review';
import { usePdf } from '@/lib/use-pdf';
import { FileIcon, XIcon } from '../Icons';
import { PdfThumbnail } from '../send/PdfThumbnail';
import { clauseLabel } from './ReviewFindings';

/**
 * The contract as the review read it (`GET /documents/:id/text`), one block
 * per clause. Text a finding points at (`issue.clauseRange`) is highlighted by
 * severity; clicking it selects that finding, and selecting a finding scrolls
 * here. A scanned PDF has no text layer, so it shows the pages instead.
 */
export function ReviewDocument({
  documentId,
  fileName,
  issues,
  selected,
  onSelect,
  open,
  onClose,
}: {
  documentId: string;
  fileName: string;
  issues: IssueWire[];
  selected: string | null;
  onSelect: (issueId: string | null) => void;
  /** Small screens: the pane is an overlay, shown only while open. */
  open: boolean;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<DocumentTextWire | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setDoc(null);
    setError('');
    getDocumentText(documentId)
      .then((d) => alive && setDoc(d))
      .catch((err) => alive && setError(errorText(err, 'Hujjat matnini olib bölmadi.')));
    return () => {
      alive = false;
    };
  }, [documentId]);

  const selectedIssue = issues.find((i) => i.id === selected) ?? null;

  return (
    <aside
      className={`${
        open ? 'fixed inset-0 z-40 flex' : 'hidden'
      } w-full flex-col border-l border-line bg-page lg:static lg:flex lg:w-[48%] lg:max-w-3xl`}
      aria-label="Hujjat matni"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 text-sm">
        <FileIcon className="size-4 shrink-0 text-muted" />
        <span className="truncate font-medium">{fileName}</span>
        <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm ml-auto lg:hidden" aria-label="Yopiş">
          <XIcon className="size-4" />
        </button>
      </div>

      {selectedIssue && !selectedIssue.clauseRange && (
        <p className="shrink-0 border-b border-line bg-subtle px-4 py-2 text-xs text-muted">
          {clauseLabel(selectedIssue.clauseRef)}: bu band hujjatda aniq topilmadi, şuning uçun belgilanmadi.
        </p>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {error ? (
          <p className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-4 text-sm text-ink/80">{error}</p>
        ) : !doc ? (
          <Paper>
            <div className="space-y-3" aria-hidden>
              {[90, 100, 95, 70, 100, 85, 60].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-subtle" style={{ width: `${w}%` }} />
              ))}
            </div>
          </Paper>
        ) : doc.scanned ? (
          <ScannedPdf documentId={documentId} />
        ) : (
          <TextDocument doc={doc} issues={issues} selected={selected} onSelect={onSelect} />
        )}
      </div>
    </aside>
  );
}

function Paper({ children }: { children: ReactNode }) {
  return (
    <article
      data-theme="light"
      className="mx-auto max-w-2xl rounded-sm bg-paper px-6 py-8 font-doc text-[15px] leading-7 text-paper-ink shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] sm:px-10 sm:py-12"
    >
      {children}
    </article>
  );
}

function TextDocument({
  doc,
  issues,
  selected,
  onSelect,
}: {
  doc: DocumentTextWire;
  issues: IssueWire[];
  selected: string | null;
  onSelect: (issueId: string | null) => void;
}) {
  const blocks = useMemo(() => buildBlocks(doc, issues), [doc, issues]);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    const mark = paper.current?.querySelector(`[data-issue="${CSS.escape(selected)}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selected]);

  if (!doc.text.trim()) {
    return (
      <Paper>
        <p className="text-sm text-muted">Hujjatda matn topilmadi.</p>
      </Paper>
    );
  }

  return (
    <div ref={paper}>
    <Paper>
      {blocks.map((b) => (
        <p key={b.key} className={`mb-4 whitespace-pre-wrap ${b.heading ? 'first-line:font-semibold' : ''}`}>
          {b.runs.map((run) => {
            const piece = doc.text.slice(run.start, run.end);
            if (run.issues.length === 0) return <span key={run.start}>{piece}</span>;
            // The open finding wins where findings overlap, then the most severe.
            const issue = run.issues.find((i) => i.id === selected) ?? run.issues[0];
            const isSelected = issue.id === selected;
            return (
              <mark
                key={run.start}
                data-issue={issue.id}
                role="button"
                tabIndex={0}
                title={issue.problem}
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : issue.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(isSelected ? null : issue.id);
                  }
                }}
                className={`cursor-pointer rounded-sm border-b-2 text-inherit transition [box-decoration-break:clone] ${
                  severityMeta[issue.severity].doc
                } ${isSelected ? 'outline-2 outline-offset-1 outline-accent' : 'hover:brightness-95'}`}
              >
                {piece}
              </mark>
            );
          })}
        </p>
      ))}
    </Paper>
    </div>
  );
}

/** A scanned PDF: the pages themselves, since there is no text to highlight. */
function ScannedPdf({ documentId }: { documentId: string }) {
  const { pdf, error } = usePdf(documentId, () => getDocumentFile(documentId));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
        Bu skanerlangan PDF: unda matn qatlami yöq, şuning uçun bandlarni belgilab bölmaydi.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!pdf && !error && <div className="aspect-[1/1.41] animate-pulse rounded-sm bg-subtle" aria-hidden />}
      {pdf &&
        Array.from({ length: pdf.numPages }, (_, i) => (
          <div key={i} data-theme="light" className="overflow-hidden rounded-sm shadow-sm">
            <PdfThumbnail pdf={pdf} page={i + 1} width={720} />
          </div>
        ))}
    </div>
  );
}
