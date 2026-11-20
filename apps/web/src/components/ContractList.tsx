'use client';

import Link from 'next/link';
import { useState } from 'react';
import { contracts, severityMeta, statusMeta, type ContractStatus } from '@/lib/demo';
import { ChevronRightIcon } from './Icons';

const TABS: { id: 'all' | ContractStatus; label: string }[] = [
  { id: 'all', label: 'Hammasi' },
  { id: 'new', label: 'Yangi' },
  { id: 'changes', label: 'Özgartiriş söralgan' },
  { id: 'signed', label: 'Imzolangan' },
];

export function ContractList() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const rows = tab === 'all' ? contracts : contracts.filter((c) => c.status === tab);

  return (
    <>
      <div className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.id === 'all' ? contracts.length : contracts.filter((c) => c.status === t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition ${
                tab === t.id ? 'bg-ink font-medium text-white' : 'bg-white/70 text-ink/70 shadow-[inset_0_0_0_1px_white] hover:text-ink'
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] ${tab === t.id ? 'bg-white/20 text-white' : 'bg-sand text-muted'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="halo mt-5">
      <ul className="divide-y divide-line overflow-hidden rounded-[1.1rem] bg-white">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href="/review" className="flex items-center gap-4 px-5 py-4 transition hover:bg-accent-soft/50">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#e6effd,#e7e5ff)] text-sm font-semibold text-accent">
                {c.sender.replace(/[“”"]/g, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                {c.status === 'new' && (
                  <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-coral ring-2 ring-white" title="Yangi" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`truncate ${c.status === 'new' ? 'font-semibold' : 'font-medium'}`}>{c.title}</div>
                <div className="text-sm text-muted">{c.sender}</div>
              </div>
              {c.risk && (
                <span className="hidden items-center gap-1.5 text-xs text-muted md:flex">
                  <span className={`size-2 rounded-full ${severityMeta[c.risk].dot}`} />
                  {severityMeta[c.risk].label} xavf
                </span>
              )}
              <span className={`hidden rounded-full px-2 py-0.5 text-xs sm:inline ${statusMeta[c.status].className}`}>
                {statusMeta[c.status].label}
              </span>
              <span className="w-14 text-right text-sm text-muted">{c.received}</span>
              <ChevronRightIcon className="size-4 text-muted" />
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Bu bölimda şartnoma yöq</li>}
      </ul>
      </div>
    </>
  );
}
