'use client';

import { useEffect, useRef } from 'react';
import type { IssueWire, ReviewWire, Severity } from '@lex/contracts';
import { severityMeta } from '@/lib/severity';
import { ChevronRightIcon, ExternalIcon, ScaleIcon } from '../Icons';

const RISK: Record<NonNullable<ReviewWire['riskLevel']>, { label: string; text: string }> = {
  high: { label: 'Yuqori xavf', text: 'text-danger' },
  medium: { label: 'Örtaça xavf', text: 'text-warning' },
  low: { label: 'Past xavf', text: 'text-success' },
};

const VERDICT: Record<NonNullable<ReviewWire['verdict']>, string> = {
  acceptable: 'Imzolaş mumkin',
  needs_changes: 'Imzolaşdan oldin tuzatiş kerak',
  not_acceptable: 'Bu holida imzolaş tavsiya etilmaydi',
};

const SEVERITIES: Severity[] = ['high', 'medium', 'low'];
const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** "3" → "3-band"; the document's own wording ("7-modda", "Статья 7") stays as is. */
export function clauseLabel(ref: string): string {
  return /^\d+(\.\d+)*$/.test(ref) ? `${ref}-band` : ref;
}

/** Most severe first; the API's order is kept within a severity. */
export function sortIssues(issues: IssueWire[]): IssueWire[] {
  return [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/**
 * A finished review: risk, verdict, summary, then the findings. A finding
 * opens to show the quoted text, the recommendation and the law it rests on.
 * `selected` is shared with the document pane, which highlights that clause.
 */
export function ReviewFindings({
  review,
  selected,
  onSelect,
}: {
  review: ReviewWire;
  selected: string | null;
  onSelect: (issueId: string | null) => void;
}) {
  const issues = sortIssues(review.issues);
  const risk = review.riskLevel ? RISK[review.riskLevel] : null;
  const counts = SEVERITIES.map((s) => ({ s, n: issues.filter((i) => i.severity === s).length })).filter((c) => c.n > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed">
        Şartnomani Özbekiston qonunlari bilan soliştirdim
        {review.lawVersionDate && (
          <span className="text-muted"> ({review.lawVersionDate} holatiga)</span>
        )}
        :
      </p>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
          <div className="min-w-0 flex-1">
            {risk && <div className={`text-xl font-bold ${risk.text}`}>{risk.label}</div>}
            {review.verdict && <div className="mt-0.5 text-sm font-medium text-ink/80">{VERDICT[review.verdict]}</div>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {counts.length === 0 ? (
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">Muammo topilmadi</span>
            ) : (
              counts.map(({ s, n }) => (
                <span key={s} className={`rounded-full px-2 py-0.5 text-xs ring-1 ${severityMeta[s].badge}`}>
                  {severityMeta[s].label}: {n}
                </span>
              ))
            )}
          </div>
        </div>
        {review.summary && (
          <p className="border-t border-line bg-page/60 px-5 py-3 text-sm leading-relaxed text-ink/85">{review.summary}</p>
        )}

        {issues.length > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {issues.map((issue) => (
              <Finding
                key={issue.id}
                issue={issue}
                open={selected === issue.id}
                onToggle={() => onSelect(selected === issue.id ? null : issue.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Finding({ issue, open, onToggle }: { issue: IssueWire; open: boolean; onToggle: () => void }) {
  const item = useRef<HTMLLIElement>(null);
  // Opened from the document pane: bring it into view in the findings list.
  useEffect(() => {
    if (open) item.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open]);

  return (
    <li ref={item}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-page ${open ? 'bg-page' : ''}`}
      >
        <span
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${severityMeta[issue.severity].dot}`}
          aria-label={severityMeta[issue.severity].label}
        />
        <span className={`flex-1 text-sm font-medium ${open ? '' : 'line-clamp-2'}`}>{issue.problem}</span>
        <span className="mt-0.5 shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {clauseLabel(issue.clauseRef)}
        </span>
        <ChevronRightIcon className={`mt-0.5 size-4 shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="animate-fade-up space-y-3 px-5 pb-4 pl-12 text-sm leading-relaxed">
          {issue.quote && (
            <blockquote className="border-l-2 border-line-strong pl-3 font-doc text-[15px] text-ink/75">
              “{issue.quote}”
            </blockquote>
          )}
          <p>
            <span className="font-medium">Tavsiya: </span>
            <span className="text-ink/85">{issue.recommendation}</span>
          </p>
          {issue.citation ? (
            <a
              href={issue.citation.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-page px-2.5 py-1.5 text-xs hover:border-accent/40 hover:text-accent"
            >
              <ScaleIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {issue.citation.actTitle}
                {issue.citation.articleNumber && `, ${issue.citation.articleNumber}-modda`}
              </span>
              <span className="shrink-0 text-muted">· {issue.citation.versionDate}</span>
              <ExternalIcon className="size-3 shrink-0" />
            </a>
          ) : (
            <p className="text-xs text-muted">
              Qonun manbasi topilmadi: bu topilma umumiy tavsiya sifatida körilsin.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
