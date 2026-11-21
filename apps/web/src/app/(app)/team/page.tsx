'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Link2, Trash2, UserPlus, Users } from 'lucide-react';
import type { BillingOverviewWire, TeamWire } from '@lex/contracts';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { currentUser } from '@/lib/auth';
import {
  changeRole,
  formatDate,
  getOverview,
  getTeam,
  inviteMember,
  removeMember,
  revokeInvite,
  ROLE_LABEL,
} from '@/lib/billing';
import { ApiError } from '@/lib/signing';

async function fetchTeam(): Promise<[BillingOverviewWire, TeamWire | null]> {
  const o = await getOverview();
  return [o, o.team.agencyId ? await getTeam() : null];
}

export default function TeamPage() {
  const [overview, setOverview] = useState<BillingOverviewWire | null>(null);
  const [team, setTeam] = useState<TeamWire | null>(null);
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(
    () =>
      fetchTeam()
        .then(([o, t]) => {
          setOverview(o);
          setTeam(t);
        })
        .catch(() => setError('Jamoani yuklab bölmadi.')),
    [],
  );

  useEffect(() => {
    fetchTeam()
      .then(([o, t]) => {
        setOverview(o);
        setTeam(t);
      })
      .catch(() => setError('Jamoani yuklab bölmadi.'));
  }, []);

  async function act(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarib bölmadi.');
    }
  }

  if (!overview) {
    return <div className="grid flex-1 place-items-center text-sm text-muted">{error || 'Yuklanmoqda…'}</div>;
  }

  if (!overview.team.agencyId) {
    return (
      <div className="grid flex-1 place-items-center px-4">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Users className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-medium">Jamoa bilan işlang</h1>
          <p className="mt-2 text-ink/70">
            Kompaniya tarifida 5 ta foydalanuvçi va oyiga 150 ta umumiy AI tekşiruv. Hamkasblaringizni email orqali
            taklif qiling.
          </p>
          <Link href="/pricing" className="btn btn-primary mt-6">
            Kompaniya tarifini köriş
          </Link>
        </div>
      </div>
    );
  }

  const manage = overview.canManage;
  const me = currentUser();
  const taken = (team?.members.length ?? 0) + (team?.invites.length ?? 0);
  const seats = team?.seats ?? overview.team.seats;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">{team?.agencyName || 'Jamoa'}</h1>
            <p className="mt-1 text-sm text-muted">
              {taken} / {seats} örin band
              {manage && (
                <>
                  {' · '}
                  <Link href="/billing" className="text-accent hover:underline">
                    Örin qöşiş
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger-line">
            {error}
          </div>
        )}

        {manage && <InviteForm full={taken >= seats} onInvited={(email, url) => { setLink({ email, url }); void load(); }} onError={setError} />}

        {link && <InviteLink email={link.email} url={link.url} />}

        <section className="rounded-2xl bg-surface ring-1 ring-edge">
          <div className="border-b border-line px-5 py-4 font-semibold">Aʼzolar</div>
          <ul className="divide-y divide-line">
            {team?.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.fullName}
                    {m.id === me?.id && <span className="text-muted"> (siz)</span>}
                  </div>
                  <div className="truncate text-xs text-muted">{m.email}</div>
                </div>
                {manage && m.role !== 'owner' && m.id !== me?.id ? (
                  <>
                    <select
                      aria-label={`${m.fullName} roli`}
                      value={m.role}
                      onChange={(e) => act(() => changeRole(m.id, e.target.value as 'admin' | 'member'))}
                      className="h-9 rounded-lg border border-line bg-page/70 px-2 text-sm"
                    >
                      <option value="member">{ROLE_LABEL.member}</option>
                      <option value="admin">{ROLE_LABEL.admin}</option>
                    </select>
                    <button
                      className="btn btn-ghost btn-icon btn-sm text-danger"
                      aria-label={`${m.fullName}ni jamoadan çiqariş`}
                      onClick={() => setRemoving({ id: m.id, name: m.fullName })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {team && team.invites.length > 0 && (
          <section className="rounded-2xl bg-surface ring-1 ring-edge">
            <div className="border-b border-line px-5 py-4 font-semibold">Kutilayotgan takliflar</div>
            <ul className="divide-y divide-line">
              {team.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.email}</div>
                    <div className="text-xs text-muted">
                      {ROLE_LABEL[i.role]} · {formatDate(i.expiresAt)} gaça amal qiladi
                    </div>
                  </div>
                  {manage && (
                    <button className="btn btn-ghost btn-sm" onClick={() => act(() => revokeInvite(i.id))}>
                      Bekor qiliş
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title="Jamoadan çiqarasizmi?"
          text={`${removing.name} kompaniya hujjatlari va tarifidan foydalana olmaydi. Uning hisobi bepul tarifda qoladi.`}
          confirmLabel="Çiqariş"
          danger
          onConfirm={() => {
            const id = removing.id;
            setRemoving(null);
            void act(() => removeMember(id));
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function InviteForm({
  full,
  onInvited,
  onError,
}: {
  full: boolean;
  onInvited: (email: string, url: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    onError('');
    try {
      const invite = await inviteMember(String(data.get('email') ?? ''), data.get('role') === 'admin' ? 'admin' : 'member');
      form.reset();
      onInvited(invite.email, invite.inviteUrl ?? '');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Taklif qilib bölmadi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-surface p-5 ring-1 ring-edge">
      <div className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-accent" aria-hidden /> Hamkasbni taklif qiliş
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          maxLength={320}
          placeholder="hamkasb@kompaniya.uz"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-page/70 px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/10"
        />
        <label className="sr-only" htmlFor="invite-role">
          Rol
        </label>
        <select id="invite-role" name="role" className="h-10 rounded-xl border border-line bg-page/70 px-2 text-sm">
          <option value="member">{ROLE_LABEL.member}</option>
          <option value="admin">{ROLE_LABEL.admin}</option>
        </select>
        <button type="submit" disabled={busy || full} className="btn btn-primary">
          {busy ? 'Yaratilmoqda…' : 'Havola yaratiş'}
        </button>
      </div>
      {full && <p className="mt-2 text-xs text-danger">Böş örin yöq. Tarif sahifasida foydalanuvçi qöşing.</p>}
    </form>
  );
}

/** Emails aren't sent yet: the owner copies the link and sends it. */
function InviteLink({ email, url }: { email: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl bg-accent-soft p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-accent">
        <Link2 className="size-4" aria-hidden /> {email} uçun taklif havolasi
      </div>
      <p className="mt-1 text-ink/70">Bu havolani hamkasbingizga yuboring. U 7 kun amal qiladi va bir marta işlaydi.</p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-mono text-xs" />
        <button
          className="btn btn-secondary"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Nusxalandi' : 'Nusxalaş'}
        </button>
      </div>
    </div>
  );
}
