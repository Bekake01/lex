'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CircleCheck, Minus, Plus, Receipt } from 'lucide-react';
import {
  PLANS,
  seatsPrice,
  type BillingOverviewWire,
  type PaymentWire,
} from '@lex/contracts';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  billingChanged,
  cancelPlan,
  changeSeats,
  formatDate,
  formatSom,
  getOverview,
  getPayments,
  resumePlan,
  ROLE_LABEL,
} from '@/lib/billing';
import { formatWhen } from '@/lib/format';
import { ApiError } from '@/lib/signing';

export default function BillingPage() {
  const [data, setData] = useState<BillingOverviewWire | null>(null);
  const [payments, setPayments] = useState<PaymentWire[]>([]);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  // Rendered client-side only (inside SessionGate), so window is there.
  const [justPaid] = useState(() => new URLSearchParams(window.location.search).get('paid') === '1');

  useEffect(() => {
    Promise.all([getOverview(), getPayments()])
      .then(([o, p]) => {
        setData(o);
        setPayments(p);
      })
      .catch(() => setError('Maʼlumotni yuklab bölmadi.'));
  }, []);

  async function run(action: () => Promise<BillingOverviewWire>) {
    setBusy(true);
    setError('');
    try {
      setData(await action());
      setPayments(await getPayments());
      billingChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarib bölmadi.');
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  if (!data) {
    return <div className="grid flex-1 place-items-center text-sm text-muted">{error || 'Yuklanmoqda…'}</div>;
  }

  const sub = data.subscription;
  const plan = PLANS[data.plan];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8">
        <h1 className="text-2xl font-medium tracking-tight">Tarif va tölov</h1>

        {justPaid && sub && (
          <div role="status" className="flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
            <CircleCheck className="size-4" aria-hidden /> Tölov qabul qilindi. {plan.name} tarifi faol.
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger-line">
            {error}
          </div>
        )}

        {/* Plan */}
        <section className="rounded-2xl bg-surface p-5 ring-1 ring-edge">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm text-muted">Joriy tarif</div>
              <div className="mt-0.5 text-xl font-semibold">{plan.name}</div>
              {data.team.agencyName && (
                <div className="mt-1 text-sm text-muted">
                  {data.team.agencyName} · {data.team.role ? ROLE_LABEL[data.team.role] : ''}
                </div>
              )}
              {sub && (
                <div className="mt-2 text-sm">
                  {sub.cancelAtPeriodEnd ? (
                    <span className="text-danger">{formatDate(sub.currentPeriodEnd)} da tugaydi</span>
                  ) : (
                    <span className="text-ink/75">
                      {sub.interval === 'year' ? 'Yillik' : 'Oylik'} · {formatDate(sub.currentPeriodEnd)} gaça tölangan
                    </span>
                  )}
                </div>
              )}
            </div>
            {data.canManage && (
              <div className="flex flex-wrap gap-2">
                <Link href="/pricing" className="btn btn-primary">
                  {sub ? 'Tarifni özgartiriş' : 'Tarifni oşiriş'}
                </Link>
                {sub &&
                  (sub.cancelAtPeriodEnd ? (
                    <button className="btn btn-secondary" disabled={busy} onClick={() => run(resumePlan)}>
                      Davom ettiriş
                    </button>
                  ) : (
                    <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>
                      Bekor qiliş
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Meter
              label="AI tekşiruvlar"
              used={data.checks.used}
              limit={data.checks.limit}
              hint={data.checks.lifetime ? 'Bepul, bir marta beriladi' : 'Har oyning 1-sanasida yangilanadi'}
            />
            <Meter
              label="Imzoga yuboriş"
              used={data.sends.used}
              limit={data.sends.limit}
              hint={data.sends.limit === null ? 'Cheksiz' : 'Bepul tarifda'}
            />
          </div>
        </section>

        {sub?.plan === 'company' && data.canManage && (
          <Seats
            key={sub.seats}
            seats={sub.seats}
            members={data.team.members}
            interval={sub.interval}
            busy={busy}
            onChange={(n) => run(() => changeSeats(n))}
          />
        )}

        {/* Payments */}
        <section className="rounded-2xl bg-surface ring-1 ring-edge">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4 font-semibold">
            <Receipt className="size-4 text-muted" aria-hidden /> Tölovlar tarixi
          </div>
          {payments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Hali tölov yöq.</p>
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">{p.description}</span>
                  <span className="text-muted">{formatWhen(p.createdAt)}</span>
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
                    {p.provider === 'test' ? 'Test' : p.provider}
                  </span>
                  <span className="w-32 text-right font-medium tabular-nums">{formatSom(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirmCancel && sub && (
        <ConfirmDialog
          title="Tarifni bekor qilasizmi?"
          text={`Tarif ${formatDate(sub.currentPeriodEnd)} gaça işlaydi, keyin bepul tarifga qaytasiz. Istalgan payt davom ettiriş mumkin.`}
          confirmLabel="Ha, bekor qiliş"
          danger
          busy={busy}
          onConfirm={() => run(cancelPlan)}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

function Meter({ label, used, limit, hint }: { label: string; used: number; limit: number | null; hint: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = limit !== null && used >= limit;
  return (
    <div className="rounded-xl bg-page/60 p-4 ring-1 ring-edge">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={full ? 'font-medium text-danger' : 'text-muted'}>
          {used} / {limit ?? '∞'}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
          <div className={`h-full rounded-full ${full ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-2 text-xs text-muted">{hint}</div>
    </div>
  );
}

function Seats({
  seats,
  members,
  interval,
  busy,
  onChange,
}: {
  seats: number;
  members: number;
  interval: 'month' | 'year';
  busy: boolean;
  onChange: (seats: number) => void;
}) {
  // Keyed by `seats`, so a saved change starts this over from the new value.
  const [want, setWant] = useState(seats);
  const min = Math.max(PLANS.company.includedSeats, members);
  const added = want - seats;

  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-edge">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Foydalanuvçilar soni</div>
          <div className="mt-0.5 text-sm text-muted">
            {members} ta aʼzo · {seats} ta örin ·{' '}
            <Link href="/team" className="text-accent hover:underline">
              Jamoani boşqariş
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Kamaytiriş"
            disabled={want <= min}
            onClick={() => setWant((n) => Math.max(min, n - 1))}
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center font-medium tabular-nums">{want}</span>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Köpaytiriş" onClick={() => setWant((n) => n + 1)}>
            <Plus className="size-4" />
          </button>
          <button className="btn btn-secondary ml-2" disabled={busy || want === seats} onClick={() => onChange(want)}>
            {added > 0 ? `${formatSom(seatsPrice(added, interval))} tölaş` : 'Saqlaş'}
          </button>
        </div>
      </div>
    </section>
  );
}
