'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PLANS, type BillingOverviewWire } from '@lex/contracts';
import { getOverview, onBillingChanged } from '@/lib/billing';

/** Sidebar card: plan name and AI checks left, with an upgrade link. */
export function UsageMeter() {
  const [data, setData] = useState<BillingOverviewWire | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getOverview()
        .then((d) => alive && setData(d))
        .catch(() => undefined);
    void load();
    const off = onBillingChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!data) return null;
  const { used, limit, lifetime } = data.checks;
  const left = Math.max(0, limit - used);
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const low = left <= Math.max(1, Math.round(limit * 0.15));

  return (
    <Link
      href={data.plan === 'free' ? '/pricing' : '/billing'}
      className="mx-1 mb-2 block rounded-xl bg-page/60 p-3 ring-1 ring-edge transition hover:ring-line-strong"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{PLANS[data.plan].name} tarif</span>
        <span className={low ? 'font-medium text-danger' : 'text-muted'}>
          {left} / {limit} {lifetime ? 'bepul' : 'bu oy'}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-label="AI tekşiruvlar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={`h-full rounded-full ${low ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      {data.plan === 'free' && <div className="mt-2 text-xs font-medium text-accent">Tarifni oşiriş →</div>}
    </Link>
  );
}
