'use client';

import { contract, review, severityMeta, type Severity } from '@/lib/demo';
import { CheckIcon, ChevronRightIcon, ExternalIcon, ScaleIcon } from '../Icons';

function riskOf(score: number) {
  if (score >= 60) return { label: 'Yuqori xavf', color: '#dc2626', text: 'text-red-700' };
  if (score >= 35) return { label: 'Örtaça xavf', color: '#d97706', text: 'text-amber-700' };
  return { label: 'Past xavf', color: '#059669', text: 'text-emerald-700' };
}

export function ReviewCard({
  suggested,
  selected,
  onSelect,
}: {
  suggested: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const score = review.score;
  const risk = riskOf(score);
  const r = 26;
  const c = 2 * Math.PI * r;
  const counts = (['high', 'medium', 'low'] as Severity[]).map((s) => ({
    s,
    n: review.issues.filter((i) => i.severity === s).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed">
        {contract.sender} yuborgan şartnomani {review.articlesChecked} ta qonun moddasi bilan soliştirdim:
      </p>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {/* Risk summary */}
        <div className="flex items-center gap-5 p-5">
          <div className="relative size-16 shrink-0">
            <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
              <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e9f0" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r={r}
                fill="none"
                stroke={risk.color}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - score / 100)}
                className="transition-[stroke-dashoffset] duration-700"
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-lg font-semibold">{score}</span>
          </div>
          <div className="min-w-0">
            <div className={`text-xl font-bold ${risk.text}`}>{risk.label}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {counts.map(({ s, n }) => (
                <span key={s} className={`rounded-full px-2 py-0.5 text-xs ring-1 ${severityMeta[s].badge}`}>
                  {severityMeta[s].label}: {n}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="border-t border-line bg-cream/60 px-5 py-3 text-sm leading-relaxed text-ink/85">{review.verdict}</p>

        {/* Issues */}
        <ul className="divide-y divide-line border-t border-line">
          {review.issues.map((issue) => {
            const open = selected === issue.id;
            const done = suggested.has(issue.id);
            const n = contract.clauses.find((cl) => cl.id === issue.clauseId)?.number;
            return (
              <li key={issue.id}>
                <button
                  onClick={() => onSelect(open ? null : issue.id)}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-cream ${open ? 'bg-cream' : ''}`}
                >
                  {done ? (
                    <span className="grid size-4 place-items-center rounded-full bg-emerald-500 text-white">
                      <CheckIcon className="size-2.5" />
                    </span>
                  ) : (
                    <span className={`size-2.5 shrink-0 rounded-full ${severityMeta[issue.severity].dot} mx-[3px]`} />
                  )}
                  <span className="flex-1 text-sm font-medium">{issue.title}</span>
                  {done && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">taklif</span>}
                  <span className="shrink-0 rounded bg-sand px-1.5 py-0.5 font-mono text-[11px] text-muted">{n}-band</span>
                  <ChevronRightIcon className={`size-4 shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && (
                  <div className="animate-fade-up space-y-3 px-5 pb-4 pl-12 text-sm leading-relaxed">
                    <p className="text-ink/85">{issue.problem}</p>
                    <p>
                      <span className="font-medium">Tavsiya: </span>
                      <span className="text-ink/85">{issue.recommendation}</span>
                    </p>
                    <a
                      href={issue.citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-line bg-cream px-2.5 py-1.5 text-xs hover:border-accent/40 hover:text-accent"
                    >
                      <ScaleIcon className="size-3.5" />
                      {issue.citation.law}, {issue.citation.article}
                      <ExternalIcon className="size-3" />
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[15px] leading-relaxed">
        Muammoli band uçun taklif tayyorlaşimni sörang — masalan, <em>“4-band uçun taklif tayyorla”</em>.
      </p>
    </div>
  );
}
