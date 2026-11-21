'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, Check, Minus, Plus, ShieldCheck, Sparkles, User } from 'lucide-react';
import {
  PLANS,
  planPrice,
  YEARLY_DISCOUNT_PERCENT,
  type BillingInterval,
  type BillingOverviewWire,
  type PaidPlanId,
  type PlanId,
} from '@lex/contracts';
import { billingChanged, checkout, formatSom, getOverview } from '@/lib/billing';
import { ApiError } from '@/lib/signing';
import { XIcon } from '@/components/Icons';

const ICONS = { free: Sparkles, individual: User, company: Building2 } as const;
const MIN_SEATS = PLANS.company.includedSeats;

export default function PricingPage() {
  const router = useRouter();
  const [interval, setPeriod] = useState<BillingInterval>('month');
  const [seats, setSeats] = useState(MIN_SEATS);
  const [me, setMe] = useState<BillingOverviewWire | null>(null);
  const [buying, setBuying] = useState<PaidPlanId | null>(null);

  useEffect(() => {
    getOverview()
      .then((d) => {
        setMe(d);
        if (d.subscription?.plan === 'company') setSeats(d.subscription.seats);
        if (d.subscription) setPeriod(d.subscription.interval);
      })
      .catch(() => undefined);
  }, []);

  const current: PlanId = me?.plan ?? 'free';
  const inCompany = Boolean(me?.team.agencyId);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="text-center">
          <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Tarifni tanlang</h1>
          <p className="mx-auto mt-3 max-w-xl text-ink/70">
            Har bir yangi hisobga 3 ta bepul AI tekşiruv. Keyin — özingizga yoki butun jamoangizga mos tarif.
          </p>

          <div
            role="radiogroup"
            aria-label="Tölov davri"
            className="mt-7 inline-flex rounded-full bg-surface/70 p-1 ring-1 ring-edge"
          >
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={interval === value}
                onClick={() => setPeriod(value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  interval === value ? 'bg-ink text-page' : 'text-ink/65 hover:text-ink'
                }`}
              >
                {value === 'month' ? 'Oylik' : 'Yillik'}
                {value === 'year' && (
                  <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">
                    −{YEARLY_DISCOUNT_PERCENT}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {(['free', 'individual', 'company'] as const).map((id) => {
            const plan = PLANS[id];
            const Icon = ICONS[id];
            const featured = id === 'company';
            const isCurrent = current === id;
            const price = id === 'free' ? 0 : planPrice(id, interval, id === 'company' ? seats : undefined);
            const perMonth = interval === 'year' ? Math.round(price / 12) : price;
            const blocked = id === 'individual' && inCompany;

            return (
              <section
                key={id}
                className={`relative flex flex-col rounded-2xl bg-surface p-6 ring-1 ${
                  featured ? 'shadow-[0_12px_40px_var(--shadow)] ring-accent' : 'ring-edge'
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-on-color">
                    Jamoalar uçun
                  </span>
                )}
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  {isCurrent && (
                    <span className="ml-auto rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">Joriy tarif</span>
                  )}
                </div>

                <div className="mt-5">
                  <span className="text-3xl font-semibold tracking-tight">{id === 'free' ? '0' : formatSom(perMonth)}</span>
                  {id !== 'free' && <span className="text-sm text-muted"> / oy</span>}
                  <div className="mt-1 h-5 text-sm text-muted">
                    {id === 'free'
                      ? 'Röyxatdan ötganda'
                      : interval === 'year'
                        ? `Yiliga ${formatSom(price)}`
                        : 'Har oy tölanadi'}
                  </div>
                </div>

                {id === 'company' && (
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-page/70 px-3 py-2 ring-1 ring-edge">
                    <span className="text-sm">Foydalanuvçilar</span>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label="Kamaytiriş"
                        disabled={seats <= MIN_SEATS}
                        onClick={() => setSeats((n) => Math.max(MIN_SEATS, n - 1))}
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-8 text-center font-medium tabular-nums" aria-live="polite">
                        {seats}
                      </span>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label="Köpaytiriş"
                        onClick={() => setSeats((n) => Math.min(200, n + 1))}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {id === 'free' ? (
                    <button className="btn btn-secondary w-full" disabled>
                      {current === 'free' ? 'Hozirgi tarifingiz' : 'Bepul'}
                    </button>
                  ) : blocked ? (
                    <p className="text-center text-sm text-muted">Siz kompaniya aʼzosisiz</p>
                  ) : me && !me.canManage ? (
                    <p className="text-center text-sm text-muted">Tarifni kompaniya egasi boşqaradi</p>
                  ) : (
                    <button
                      className={`btn w-full ${featured ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setBuying(id)}
                    >
                      {isCurrent ? 'Uzaytiriş' : `${plan.name} tarifini tanlaş`}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4" aria-hidden />
          Hozir test tölov: pul yeçilmaydi. Payme va Click tez orada.
        </p>
      </div>

      {buying && (
        <CheckoutDialog
          plan={buying}
          interval={interval}
          seats={buying === 'company' ? seats : 1}
          needsCompanyName={buying === 'company' && !inCompany}
          onClose={() => setBuying(null)}
          onDone={() => {
            billingChanged();
            router.push('/billing?paid=1');
          }}
        />
      )}
    </div>
  );
}

/** Shown in checkout, not working yet (no merchant accounts). */
const PROVIDERS = [
  { id: 'payme', name: 'Payme' },
  { id: 'click', name: 'Click' },
] as const;

function CheckoutDialog({
  plan,
  interval,
  seats,
  needsCompanyName,
  onClose,
  onDone,
}: {
  plan: PaidPlanId;
  interval: BillingInterval;
  seats: number;
  needsCompanyName: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Payme / Click aren't connected yet: picking one only says so. */
  const [soon, setSoon] = useState<string | null>(null);
  const amount = planPrice(plan, interval, seats);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function pay() {
    if (needsCompanyName && companyName.trim() === '') {
      setError('Kompaniya nomini kiriting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await checkout({ plan, interval, seats, companyName: needsCompanyName ? companyName.trim() : undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tölov ötmadi. Qayta urinib köring.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label="Tölov"
        className="w-full max-w-md animate-fade-up rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="font-semibold">Tölov</div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Yopiş">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <dl className="space-y-2">
            <Row label="Tarif" value={PLANS[plan].name} />
            <Row label="Davr" value={interval === 'year' ? `Yillik (−${YEARLY_DISCOUNT_PERCENT}%)` : 'Oylik'} />
            {plan === 'company' && <Row label="Foydalanuvçilar" value={String(seats)} />}
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>Jami</dt>
              <dd>{formatSom(amount)}</dd>
            </div>
          </dl>

          {needsCompanyName && (
            <label className="block space-y-1.5">
              <span className="font-medium">Kompaniya nomi</span>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={200}
                autoFocus
                placeholder="Masalan, Adolat Huquq MÇJ"
                className="h-11 w-full rounded-xl border border-line bg-page/70 px-3 outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/10"
              />
              <span className="block text-xs text-muted">Siz kompaniya egasi bölasiz va jamoani taklif qila olasiz.</span>
            </label>
          )}

          <div className="space-y-2">
            <div className="font-medium">Tölov usuli</div>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setError('');
                    setSoon(p.name);
                  }}
                  aria-describedby={soon === p.name ? 'provider-soon' : undefined}
                  className={`flex h-14 items-center justify-between rounded-xl border bg-page/70 px-3 transition hover:border-line-strong ${
                    soon === p.name ? 'border-accent ring-4 ring-accent/10' : 'border-line'
                  }`}
                >
                  <span className="text-base font-bold tracking-tight">{p.name}</span>
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">Tez orada</span>
                </button>
              ))}
            </div>
            {soon && (
              <p id="provider-soon" role="status" className="rounded-xl bg-subtle px-3 py-2.5 text-ink/80">
                {soon} orqali tölov tez orada ulanadi. Hozircha test tölov bilan davom eting.
              </p>
            )}
          </div>

          <div className="rounded-xl bg-accent-soft px-3 py-2.5 text-accent">
            Test tölov: karta sörlmaydi va pul yeçilmaydi.
          </div>
          {error && (
            <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-danger ring-1 ring-danger-line">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="btn btn-ghost">
            Bekor qiliş
          </button>
          <button onClick={pay} disabled={busy} className="btn btn-primary">
            {busy ? 'Tölanmoqda…' : `Test tölov · ${formatSom(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
