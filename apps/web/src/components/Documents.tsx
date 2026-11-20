'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DEMO_LOGIN } from '@/lib/auth';
import { contracts, myDocuments, severityMeta } from '@/lib/demo';
import { createDraft, DEMO_DRAFT_ID, sendStartError, startSending } from '@/lib/signing';
import { formatSize, SEND_ACCEPT, sendUploadError, UPLOAD_ACCEPT, UPLOAD_MAX_MB, uploadError } from '@/lib/upload';
import { CheckIcon, ChevronRightIcon, FileIcon, PenIcon, UploadIcon } from './Icons';

type Contract = (typeof contracts)[number];

// Signing list filters. Whose turn it is decides the filter:
// mine to sign → "Imzolaşim kerak"; waiting on the other side (sent by me, or I asked for changes) → "Javob kutilmoqda".
const FILTERS: { id: string; label: string; empty: string; match: (c: Contract) => boolean }[] = [
  { id: 'sign', label: 'Imzolaşim kerak', empty: 'Hozirça imzolaşingiz kerak bölgan hujjat yöq', match: (c) => c.status === 'new' },
  {
    id: 'waiting',
    label: 'Javob kutilmoqda',
    empty: 'Javob kutayotgan hujjat yöq',
    match: (c) => c.status === 'waiting' || c.status === 'changes',
  },
  { id: 'signed', label: 'Imzolangan', empty: 'Hali imzolangan hujjat yöq', match: (c) => c.status === 'signed' },
];

type View = 'signing' | 'files';

/** "Hujjatlar" page: documents in a signing flow (with filters) and the user's own files. */
export function Documents() {
  const [view, setView] = useState<View>('signing');
  const [files, setFiles] = useState<FileRow[]>(myDocuments);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sendInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /** PDF → upload → draft → the field editor. */
  async function sendForSignature(file: File | undefined) {
    if (!file) return;
    const problem = sendUploadError(file);
    if (problem) return setError(problem);
    setError('');
    setStarting(true);
    try {
      const { documentId, draftId } = await startSending(file);
      setFiles((prev) => [
        { id: draftId, name: file.name, size: formatSize(file.size), added: 'Hozirgina', documentId },
        ...prev,
      ]);
      router.push(`/documents/send/${draftId}`);
    } catch (err) {
      setError(sendStartError(err));
      setStarting(false);
    }
  }

  /** A file already uploaded (or the demo one) → a new draft. */
  async function sendExisting(row: FileRow) {
    setError('');
    if (DEMO_LOGIN || !row.documentId) return router.push(`/documents/send/${DEMO_DRAFT_ID}`);
    try {
      router.push(`/documents/send/${(await createDraft(row.documentId)).id}`);
    } catch (err) {
      setError(sendStartError(err));
    }
  }

  // Demo: uploads live in this list only until the page reloads. TODO: POST /documents + list from the API.
  function add(list: FileList | null | undefined) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setError(picked.map(uploadError).find(Boolean) ?? '');
    const ok = picked.filter((f) => !uploadError(f));
    setFiles((prev) => [
      ...ok.map((f) => ({ id: `${f.name}-${f.lastModified}-${Math.random()}`, name: f.name, size: formatSize(f.size), added: 'Hozirgina' })),
      ...prev,
    ]);
    if (ok.length) setView('files');
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
          add(e.target.files);
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
          <button onClick={() => input.current?.click()} className="btn btn-secondary btn-sm">
            <UploadIcon className="size-4" />
            Hujjat yuklaş
          </button>
          <button onClick={() => sendInput.current?.click()} disabled={starting} className="btn btn-primary btn-sm">
            <PenIcon className="size-4" />
            {starting ? 'Tayyorlanmoqda…' : 'Imzoga yuboriş'}
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

      {view === 'signing' ? <SigningList /> : <MyFiles files={files} onDrop={add} onSend={sendExisting} />}
    </div>
  );
}

function SigningList() {
  const [filter, setFilter] = useState(FILTERS[0].id);
  const active = FILTERS.find((f) => f.id === filter)!;
  const rows = contracts.filter(active.match);

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n = contracts.filter(f.match).length;
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

      {rows.length === 0 ? (
        <Empty text={active.empty} />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href="/review"
                className="group flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-line-strong hover:shadow-[0_4px_16px_var(--shadow)] sm:px-5"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <FileIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                    <span className="truncate">{c.direction === 'in' ? `${c.sender} yubordi` : `${c.sender}ga yuborildi`}</span>
                    <span className="text-faint">·</span>
                    <span>{c.received}</span>
                    {c.risk && c.status !== 'signed' && (
                      <>
                        <span className="text-faint">·</span>
                        <span className="flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${severityMeta[c.risk].dot}`} />
                          {severityMeta[c.risk].label} xavf
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <RowAction status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** What the row means for the user right now, said plainly. */
function RowAction({ status }: { status: Contract['status'] }) {
  if (status === 'new') {
    return <span className="btn btn-primary btn-sm shrink-0">Körib çiqiş</span>;
  }
  if (status === 'signed') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-sm text-success">
        <CheckIcon className="size-4" />
        <span className="hidden sm:inline">Imzolangan</span>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
      <span className="hidden sm:inline">{status === 'changes' ? 'Özgartiriş söralgan' : 'Imzo kutilmoqda'}</span>
      <ChevronRightIcon className="size-4 transition group-hover:translate-x-0.5" />
    </span>
  );
}

/** `documentId` is set once the file is on the server (POST /documents). */
type FileRow = { id: string; name: string; size: string; added: string; documentId?: string };

function MyFiles({
  files,
  onDrop,
  onSend,
}: {
  files: FileRow[];
  onDrop: (list: FileList) => void;
  onSend: (row: FileRow) => void;
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

      {files.length === 0 ? (
        <Empty text="Hali hujjat yuklanmagan" />
      ) : (
        <ul
          className={`divide-y divide-line overflow-hidden rounded-2xl border bg-surface transition ${
            dragging ? 'border-accent ring-2 ring-accent/25' : 'border-line'
          }`}
        >
          {files.map((f) => (
            <li key={f.id} className="flex items-center transition hover:bg-subtle/60">
              <Link href="/review" className="group flex min-w-0 flex-1 items-center gap-4 px-4 py-3 sm:px-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                  <FileIcon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{f.name}</div>
                  <div className="text-sm text-muted">
                    {f.size} · {f.added}
                  </div>
                </div>
                <span className="hidden text-sm text-muted transition group-hover:text-accent sm:inline">AI bilan tekşiriş</span>
                <ChevronRightIcon className="size-4 text-muted transition group-hover:translate-x-0.5" />
              </Link>
              {/\.pdf$/i.test(f.name) && (
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
