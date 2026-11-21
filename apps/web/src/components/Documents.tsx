'use client';

import type { DocumentWire, SigningRequestRow } from '@lex/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_LOGIN } from '@/lib/auth';
import { formatWhen } from '@/lib/format';
import {
  createDraft,
  DEMO_DRAFT_ID,
  listDocuments,
  listSends,
  sendStartError,
  startSending,
  uploadDocument,
} from '@/lib/signing';
import { uploadErrorText, uploadForReview } from '@/lib/review';
import { formatSize, SEND_ACCEPT, sendUploadError, UPLOAD_ACCEPT, UPLOAD_MAX_MB, uploadError } from '@/lib/upload';
import { CheckIcon, ChevronRightIcon, FileIcon, PenIcon, UploadIcon } from './Icons';

/** One row of the signing list: a send of mine, or my own copy in someone else's send. */
type SigningRow = SigningRequestRow & { box: 'sent' | 'inbox' };

/** Fully signed: everyone invited signed (an open-link-only send stays "waiting"). */
const isDone = (r: SigningRow) =>
  r.box === 'inbox'
    ? r.mine?.status === 'signed'
    : r.status === 'sent' && r.recipientCount > 0 && r.signedCount >= r.recipientCount;

// Whose turn it is decides the filter: mine to sign → "Imzolaşim kerak";
// my sends still collecting signatures (and drafts) → "Javob kutilmoqda".
const FILTERS: { id: string; label: string; empty: string; match: (r: SigningRow) => boolean }[] = [
  {
    id: 'sign',
    label: 'Imzolaşim kerak',
    empty: 'Hozirça imzolaşingiz kerak bölgan hujjat yöq',
    match: (r) => r.box === 'inbox' && !isDone(r),
  },
  {
    id: 'waiting',
    label: 'Javob kutilmoqda',
    empty: 'Javob kutayotgan hujjat yöq',
    match: (r) => r.box === 'sent' && !isDone(r),
  },
  { id: 'signed', label: 'Imzolangan', empty: 'Hali imzolangan hujjat yöq', match: isDone },
];

type View = 'signing' | 'files';

/** "Hujjatlar" page: documents in a signing flow (with filters) and the user's own files. */
export function Documents() {
  const [view, setView] = useState<View>('signing');
  const [sends, setSends] = useState<SigningRow[] | null>(null);
  const [files, setFiles] = useState<DocumentWire[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sendInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const loadFiles = useCallback(async () => {
    try {
      setFiles((await listDocuments()).documents);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSends('sent'), listSends('inbox')])
      .then(([sent, inbox]) => {
        if (cancelled) return;
        setSends([
          ...inbox.requests.map((r) => ({ ...r, box: 'inbox' as const })),
          ...sent.requests.map((r) => ({ ...r, box: 'sent' as const })),
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        setSends([]);
        setError('Röyxatni yuklab bölmadi.');
      });
    listDocuments()
      .then((list) => !cancelled && setFiles(list.documents))
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, []);

  /** "Hujjat yuklaş": files for the AI review (PDF / DOCX / TXT). */
  async function upload(list: FileList | null | undefined) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setError(picked.map(uploadError).find(Boolean) ?? '');
    const ok = picked.filter((f) => !uploadError(f));
    if (ok.length === 0) return;
    setView('files');
    // One file: straight to its AI review. Several: upload them all, stay on the list.
    if (ok.length === 1) {
      setBusy(true);
      try {
        router.push(`/review?doc=${(await uploadForReview(ok[0])).id}`);
      } catch (err) {
        setError(uploadErrorText(err));
        setBusy(false);
      }
      return;
    }
    if (DEMO_LOGIN) return;
    setBusy(true);
    try {
      for (const f of ok) await uploadDocument(f);
    } catch (err) {
      setError(uploadErrorText(err));
    } finally {
      setBusy(false);
      void loadFiles();
    }
  }

  /** "Imzoga yuboriş": PDF → upload → draft → the field editor. */
  async function sendForSignature(file: File | undefined) {
    if (!file) return;
    const problem = sendUploadError(file);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      router.push(`/documents/send/${(await startSending(file)).draftId}`);
    } catch (err) {
      setError(sendStartError(err));
      setBusy(false);
    }
  }

  /** A PDF already uploaded → a new draft. */
  async function sendExisting(doc: DocumentWire) {
    setError('');
    if (DEMO_LOGIN) return router.push(`/documents/send/${DEMO_DRAFT_ID}`);
    try {
      router.push(`/documents/send/${(await createDraft(doc.id)).id}`);
    } catch (err) {
      setError(sendStartError(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-10 pb-16 sm:px-6">
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={sendInput}
        type="file"
        accept={SEND_ACCEPT}
        hidden
        onChange={(e) => {
          void sendForSignature(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight">Hujjatlar</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => input.current?.click()} disabled={busy} className="btn btn-secondary btn-sm">
            <UploadIcon className="size-4" />
            Hujjat yuklaş
          </button>
          <button onClick={() => sendInput.current?.click()} disabled={busy} className="btn btn-primary btn-sm">
            <PenIcon className="size-4" />
            {busy ? 'Tayyorlanmoqda…' : 'Imzoga yuboriş'}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex gap-6 border-b border-line">
        {(
          [
            ['signing', 'Imzolaş'],
            ['files', 'Mening hujjatlarim'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`-mb-px cursor-pointer border-b-2 pb-2.5 text-[15px] transition ${
              view === id ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'signing' ? (
        <SigningList rows={sends} />
      ) : (
        <MyFiles files={files} onDrop={(l) => void upload(l)} onSend={(d) => void sendExisting(d)} />
      )}
    </div>
  );
}

function SigningList({ rows }: { rows: SigningRow[] | null }) {
  const [filter, setFilter] = useState(FILTERS[0].id);
  const active = FILTERS.find((f) => f.id === filter)!;
  if (!rows) return <p className="mt-8 text-center text-sm text-muted">Yuklanmoqda…</p>;
  const shown = rows.filter(active.match);

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n = rows.filter(f.match).length;
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
              {n > 0 && (
                <span className={on ? 'text-page/70' : f.id === 'sign' ? 'font-medium text-coral' : 'text-faint'}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty text={active.empty} />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((r) => (
            <li key={`${r.box}-${r.id}-${r.mine?.recipientId ?? ''}`}>
              <SigningRowLink row={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Inbox rows open my own signing link; my sends open the detail (drafts: the editor). */
function SigningRowLink({ row: r }: { row: SigningRow }) {
  const className =
    'group flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-line-strong hover:shadow-[0_4px_16px_var(--shadow)] sm:px-5';
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <FileIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{r.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {r.box === 'inbox' ? (
            <span className="truncate">{r.senderName ?? 'Kimdir'} yubordi</span>
          ) : r.status === 'draft' ? (
            <span>Qoralama</span>
          ) : (
            <span>
              {r.signedCount} / {r.recipientCount} imzoladi
              {r.openLinkEnabled && ' · oçiq havola'}
            </span>
          )}
          <span className="text-faint">·</span>
          <span>{formatWhen(r.sentAt ?? r.createdAt)}</span>
        </div>
      </div>
      <RowAction row={r} />
    </>
  );

  if (r.box === 'inbox' && r.mine) {
    return (
      <a href={r.mine.signUrl} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    );
  }
  const href = r.status === 'draft' ? `/documents/send/${r.id}` : `/documents/sends/${r.id}`;
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/** What the row means for the user right now, said plainly. */
function RowAction({ row: r }: { row: SigningRow }) {
  if (r.box === 'inbox' && r.mine?.status !== 'signed') {
    return <span className="btn btn-primary btn-sm shrink-0">Imzolaş</span>;
  }
  if (isDone(r)) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-sm text-success">
        <CheckIcon className="size-4" />
        <span className="hidden sm:inline">Imzolangan</span>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
      <span className="hidden sm:inline">
        {r.status === 'draft' ? 'Davom ettiriş' : r.status === 'cancelled' ? 'Bekor qilingan' : 'Imzo kutilmoqda'}
      </span>
      <ChevronRightIcon className="size-4 transition group-hover:translate-x-0.5" />
    </span>
  );
}

function MyFiles({
  files,
  onDrop,
  onSend,
}: {
  files: DocumentWire[] | null;
  onDrop: (list: FileList) => void;
  onSend: (doc: DocumentWire) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="mt-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onDrop(e.dataTransfer.files);
      }}
    >
      <p className={`mb-3 text-sm transition ${dragging ? 'text-accent' : 'text-muted'}`}>
        {dragging
          ? 'Faylni qöyib yuboring'
          : `Faylni şu yerga taşlang yoki «Hujjat yuklaş»ni bosing · PDF, DOCX, ${UPLOAD_MAX_MB} MB gaça`}
      </p>

      {!files ? (
        <p className="mt-8 text-center text-sm text-muted">Yuklanmoqda…</p>
      ) : files.length === 0 ? (
        <Empty text="Hali hujjat yuklanmagan" />
      ) : (
        <ul
          className={`divide-y divide-line overflow-hidden rounded-2xl border bg-surface transition ${
            dragging ? 'border-accent ring-2 ring-accent/25' : 'border-line'
          }`}
        >
          {files.map((f) => (
            <li key={f.id} className="flex items-center transition hover:bg-subtle/60">
              <Link href={`/review?doc=${f.id}`} className="group flex min-w-0 flex-1 items-center gap-4 px-4 py-3 sm:px-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                  <FileIcon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{f.name}</div>
                  <div className="text-sm text-muted">
                    {formatSize(f.sizeBytes)} · {formatWhen(f.createdAt)}
                    {f.version > 1 && ` · ${f.version}-versiya`}
                  </div>
                </div>
                <span className="hidden text-sm text-muted transition group-hover:text-accent sm:inline">AI bilan tekşiriş</span>
                <ChevronRightIcon className="size-4 text-muted transition group-hover:translate-x-0.5" />
              </Link>
              {f.contentType === 'application/pdf' && (
                <button onClick={() => onSend(f)} className="btn btn-soft btn-sm mr-4 shrink-0 sm:mr-5">
                  Imzoga yuboriş
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <FileIcon className="mx-auto size-7 text-faint" />
      <p className="mt-3 text-sm text-muted">{text}</p>
    </div>
  );
}
