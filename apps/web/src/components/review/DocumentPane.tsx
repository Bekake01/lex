'use client';

import { useEffect, useRef } from 'react';
import { contract, review, severityMeta } from '@/lib/demo';
import { FileIcon, XIcon } from '../Icons';

export function DocumentPane({
  suggested,
  selected,
  onSelect,
  open,
  onClose,
  dimmed,
}: {
  suggested: Set<string>; // issue ids with a change suggestion
  selected: string | null;
  onSelect: (id: string | null) => void;
  open: boolean;
  onClose: () => void;
  dimmed: boolean;
}) {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const selectedIssue = review.issues.find((i) => i.id === selected);

  useEffect(() => {
    if (selectedIssue) refs.current[selectedIssue.clauseId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedIssue]);

  return (
    <aside
      className={`${
        open ? 'fixed inset-0 z-40 flex' : 'hidden'
      } w-full flex-col border-l border-line bg-cream lg:static lg:flex lg:w-[46%] lg:max-w-3xl`}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 text-sm">
        <FileIcon className="size-4 text-muted" />
        <span className="truncate font-medium">{contract.fileName}</span>
        <span className="ml-auto text-xs text-muted">{contract.pages} bet</span>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sand lg:hidden" aria-label="Yopiş">
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <article
          className={`mx-auto max-w-2xl rounded-sm bg-white px-10 py-12 font-doc text-[15px] leading-7 text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] transition ${
            dimmed ? 'opacity-50 blur-[1px]' : ''
          }`}
        >
          <h2 className="text-center text-lg font-semibold tracking-wide uppercase">{contract.title}</h2>
          <div className="mt-4 mb-6 flex justify-between text-sm text-slate-500">
            <span>{contract.city}</span>
            <span>{contract.date}</span>
          </div>
          <p className="mb-6 indent-8">
            {contract.parties[0].name} (keyingi örinlarda “{contract.parties[0].role}”) bir tomondan va{' '}
            {contract.parties[1].name} (keyingi örinlarda “{contract.parties[1].role}”) ikkinçi tomondan quyidagilar
            haqida uşbu şartnomani tuzdilar:
          </p>

          {contract.clauses.map((c) => {
            const issue = review.issues.find((i) => i.clauseId === c.id);
            const proposal = issue && suggested.has(issue.id) ? issue.fix?.replacement : undefined;
            const isSelected = selectedIssue?.clauseId === c.id;
            const tone = dimmed || !issue
              ? 'border-transparent'
              : proposal
                ? 'bg-emerald-50/60 border-emerald-300'
                : severityMeta[issue.severity].doc;
            return (
              <section
                key={c.id}
                ref={(el) => {
                  refs.current[c.id] = el;
                }}
                onClick={() => issue && onSelect(issue.id)}
                className={`relative -mx-4 mb-3 rounded-md border-l-[3px] px-4 py-2 transition ${tone} ${
                  issue ? 'cursor-pointer' : ''
                } ${isSelected ? 'ring-2 ring-accent/30' : ''}`}
              >
                <h3 className="font-semibold">
                  {c.number}. {c.title}
                  {proposal && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 align-middle font-sans text-[10px] font-medium text-emerald-700">
                      taklif
                    </span>
                  )}
                </h3>
                <p className={`indent-8 ${proposal ? 'text-slate-400 line-through decoration-red-300' : ''}`}>
                  {c.number}.1. {c.text}
                </p>
                {proposal && <p className="mt-1 indent-8 text-emerald-900">{proposal}</p>}
              </section>
            );
          })}

          <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
            {contract.parties.map((p) => (
              <div key={p.id}>
                <div className="font-semibold">{p.role}</div>
                <div className="text-slate-600">{p.name}</div>
                <div className="mt-6 border-b border-slate-400" />
                <div className="mt-1 text-xs text-slate-400">imzo</div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </aside>
  );
}
