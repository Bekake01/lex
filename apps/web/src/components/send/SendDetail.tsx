'use client';

import type { SendSigningResponse, SigningRecipientWire, SigningRequestDetailWire } from '@lex/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FIELD_META } from '@/lib/field-catalog';
import { formatWhen } from '@/lib/format';
import { blankRow, isEmptyRow, rowProblem, toInput, type PersonRow } from '@/lib/people';
import { addRecipients, ApiError, cancelSend, downloadCopy, getSend } from '@/lib/signing';
import { ChevronLeftIcon, DownloadIcon, PlusIcon, ShieldIcon, XIcon } from '../Icons';
import { AccessSettings } from './AccessSettings';
import { LinkActions } from './LinkActions';
import { CHANNEL_ICON, PeopleEditor } from './PeopleEditor';
import { SendResult } from './SendResult';

const POLL_MS = 5_000;

const FILTERS = [
  { id: 'all', label: 'Hammasi', match: () => true },
  { id: 'signed', label: 'Imzolagan', match: (r: SigningRecipientWire) => r.status === 'signed' },
  { id: 'waiting', label: 'Kutilmoqda', match: (r: SigningRecipientWire) => r.status !== 'signed' },
] as const;

const STATUS_LABEL: Record<SigningRecipientWire['status'], string> = {
  pending: 'Yuborildi',
  viewed: 'Oçdi',
  signed: 'Imzoladi',
};

/** One send: who has signed, their links, their copies; add people, link settings, cancel. */
export function SendDetail({ id }: { id: string }) {
  const [send, setSend] = useState<SigningRequestDetailWire | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [panel, setPanel] = useState<'none' | 'add' | 'access'>('none');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [added, setAdded] = useState<SendSigningResponse | null>(null);

  const reload = useCallback(async () => {
    try {
      setSend(await getSend(id));
    } catch {
      setError('Hujjatni oçib bölmadi.');
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getSend(id)
      .then((d) => !cancelled && setSend(d))
      .catch(() => !cancelled && setError('Hujjatni oçib bölmadi.'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Signed copies are sealed by a job: poll while any is still on its way.
  const sealing = send?.recipients.some((r) => r.status === 'signed' && !r.ready) ?? false;
  useEffect(() => {
    if (!sealing) return;
    const t = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(t);
  }, [sealing, reload]);

  if (error) return <Centered text={error} />;
  if (!send) return <Centered text="Yuklanmoqda…" />;

  if (send.status === 'draft') {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-muted">Bu hali qoralama.</p>
          <Link href={`/documents/send/${send.id}`} className="btn btn-primary mt-4">
            Davom ettiriş
          </Link>
        </div>
      </div>
    );
  }

  const live = send.status === 'sent';
  const rows = send.recipients.filter(FILTERS.find((f) => f.id === filter)!.match);
  const pct = send.recipientCount > 0 ? Math.round((send.signedCount / send.recipientCount) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 pt-8 pb-16 sm:px-6">
        <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronLeftIcon className="size-4" />
          Hujjatlar
        </Link>

        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-medium tracking-tight">{send.title}</h1>
              <StatusChip status={send.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {formatWhen(send.sentAt)} yuborilgan
              {send.openLinkEnabled && ' · oçiq havola bor'}
              {send.hasPassword && ' · parol bilan'}
            </p>
          </div>
          {live && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPanel(panel === 'add' ? 'none' : 'add')}
                className={`btn btn-sm ${panel === 'add' ? 'btn-soft' : 'btn-secondary'}`}
              >
                <PlusIcon className="size-4" />
                Odam qöşiş
              </button>
              <button
                onClick={() => setPanel(panel === 'access' ? 'none' : 'access')}
                className={`btn btn-sm ${panel === 'access' ? 'btn-soft' : 'btn-secondary'}`}
              >
                <ShieldIcon className="size-4" />
                Havola sozlamalari
              </button>
              <button onClick={() => setConfirmCancel(true)} className="btn btn-ghost btn-sm text-danger">
                Bekor qiliş
              </button>
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              <span className="font-medium">{send.signedCount}</span> / {send.recipientCount} imzoladi
            </span>
            <span className="text-muted">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {panel === 'access' && (
          <div className="mt-5">
            <AccessSettings request={send} onChange={setSend} />
          </div>
        )}
        {panel === 'add' && (
          <AddPeople
            id={send.id}
            onAdded={(res) => {
              setAdded(res);
              setPanel('none');
              void reload();
            }}
          />
        )}
        {added && (
          <div className="relative mt-5 rounded-2xl border border-line">
            <button
              onClick={() => setAdded(null)}
              aria-label="Yopiş"
              className="btn btn-ghost btn-icon btn-sm absolute top-3 right-3"
            >
              <XIcon className="size-4" />
            </button>
            <SendResult result={added} title={send.title} message={send.message} heading="Yangi havolalar" />
          </div>
        )}
        {send.openLinkUrl && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Oçiq havola</div>
              <div className="truncate text-sm text-muted">{send.openLinkUrl}</div>
            </div>
            <LinkActions channel="telegram" contact={null} link={send.openLinkUrl} title={send.title} message={send.message} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = send.recipients.filter(f.match).length;
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition ${
                  on ? 'bg-ink font-medium text-page' : 'text-ink/70 hover:bg-subtle hover:text-ink'
                }`}
              >
                {f.label}
                <span className={on ? 'text-page/70' : 'text-faint'}>{n}</span>
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
            Bu yerda hozirça hech kim yöq
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map((r) => (
              <PersonLine key={r.id} send={send} person={r} live={live} />
            ))}
          </ul>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Yuborişni bekor qiliş"
          text="Hamma havolalar (oçiq havola ham) işlamay qoladi. Imzolangan nusxalar sizda qoladi."
          confirmLabel="Bekor qiliş"
          danger
          busy={cancelling}
          onClose={() => setConfirmCancel(false)}
          onConfirm={async () => {
            setCancelling(true);
            try {
              setSend(await cancelSend(send.id));
              setConfirmCancel(false);
            } finally {
              setCancelling(false);
            }
          }}
        />
      )}
    </div>
  );
}

function PersonLine({ send, person: r, live }: { send: SigningRequestDetailWire; person: SigningRecipientWire; live: boolean }) {
  const [showValues, setShowValues] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const Icon = CHANNEL_ICON[r.channel];
  const who = r.signerName ?? r.name ?? r.contact ?? 'Ismsiz';
  const signed = r.status === 'signed';

  async function download(kind: 'signed' | 'certificate') {
    setDownloadError('');
    try {
      await downloadCopy(send.id, r.id, kind, `${send.title} — ${who}${kind === 'certificate' ? ' — sertifikat' : ''}.pdf`);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Yuklab bölmadi');
    }
  }

  const values = send.fields
    .filter((f) => r.fieldValues[f.id])
    .map((f) => ({ id: f.id, label: f.label || FIELD_META[f.type].label, value: r.fieldValues[f.id] }));

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{who}</span>
            {r.source === 'open_link' && (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">Oçiq havola</span>
            )}
          </div>
          <div className="truncate text-sm text-muted">
            {[r.signerName && r.name && r.signerName !== r.name ? r.name : null, r.contact].filter(Boolean).join(' · ') ||
              (r.channel === 'link' ? 'Faqat havola' : '')}
          </div>
        </div>
        <div className="w-28 shrink-0 text-sm">
          <div className={signed ? 'text-success' : r.status === 'viewed' ? 'text-ink' : 'text-muted'}>{STATUS_LABEL[r.status]}</div>
          <div className="text-xs text-faint">{formatWhen(r.signedAt ?? r.viewedAt)}</div>
        </div>

        {signed ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {values.length > 0 && (
              <button onClick={() => setShowValues((v) => !v)} className="btn btn-ghost btn-sm">
                Qiymatlar
              </button>
            )}
            <button onClick={() => void download('signed')} disabled={!r.ready} className="btn btn-secondary btn-sm">
              {r.ready ? <DownloadIcon className="size-4" /> : <Spinner />}
              Imzolangan nusxa
            </button>
            <button onClick={() => void download('certificate')} disabled={!r.ready} className="btn btn-ghost btn-sm">
              {r.ready ? <DownloadIcon className="size-4" /> : <Spinner />}
              Sertifikat
            </button>
          </div>
        ) : (
          live && <LinkActions channel={r.channel} contact={r.contact} link={r.signUrl} title={send.title} message={send.message} />
        )}
      </div>

      {downloadError && <p className="mt-2 text-sm text-danger">{downloadError}</p>}
      {showValues && (
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-xl bg-subtle p-3 text-sm sm:grid-cols-[max-content_1fr]">
          {values.map((v) => (
            <div key={v.id} className="contents">
              <dt className="text-muted">{v.label}</dt>
              <dd className="break-words">{v.value === 'true' ? '✓' : v.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function AddPeople({ id, onAdded }: { id: string; onAdded: (res: SendSigningResponse) => void }) {
  const [rows, setRows] = useState<PersonRow[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filled = rows.filter((r) => !isEmptyRow(r));
  const ok = filled.length > 0 && !filled.some((r) => rowProblem(r));

  return (
    <div className="mt-5 rounded-2xl border border-line bg-page p-4">
      <PeopleEditor rows={rows} onChange={setRows} />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              onAdded(await addRecipients(id, { recipients: filled.map(toInput) }));
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Qöşib bölmadi');
            } finally {
              setBusy(false);
            }
          }}
          className="btn btn-primary btn-sm"
        >
          {busy ? 'Qöşilmoqda…' : `${filled.length} ta odamni qöşiş`}
        </button>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: SigningRequestDetailWire['status'] }) {
  const meta = {
    draft: { label: 'Qoralama', className: 'bg-subtle text-muted' },
    sent: { label: 'Yuborilgan', className: 'bg-info-soft text-info' },
    cancelled: { label: 'Bekor qilingan', className: 'bg-danger-soft text-danger' },
  }[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function Spinner() {
  return <span aria-label="Tayyorlanmoqda" className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />;
}

function Centered({ text }: { text: string }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
