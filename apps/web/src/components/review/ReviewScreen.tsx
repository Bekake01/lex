'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import type { AcceptEditsResponse, DocumentVersionWire, DocumentWire, ReviewWire } from '@lex/contracts';
import { billingChanged, isLimitError, showUpgrade } from '@/lib/billing';
import {
  ApiError,
  getDocument,
  getReview,
  getVersions,
  latestOrStartReview,
  poll,
  reviewFinished,
  startReview,
  uploadErrorText,
  uploadForReview,
} from '@/lib/review';
import { UPLOAD_ACCEPT, UPLOAD_MAX_MB, uploadError } from '@/lib/upload';
import { CheckIcon, FileIcon, LogoMark, UploadIcon } from '../Icons';
import { ChatComposer, ChatMessages, useReviewChat } from './ReviewChat';
import { ReviewDocument } from './ReviewDocument';
import { useEditDecisions } from './ReviewEdits';
import { SendForSigning } from './ReviewSend';
import { ReviewFindings } from './ReviewFindings';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const STEPS = [
  'Hujjat matni öqilmoqda',
  'Rasmiy qonunlardan tegişli moddalar qidirilmoqda',
  'Bandlar qonunçilik bilan soliştirilmoqda',
];

type Phase =
  | { kind: 'loading' }
  | { kind: 'waiting'; review: ReviewWire | null }
  | { kind: 'done'; review: ReviewWire }
  | { kind: 'failed'; reason: string; detail?: string }
  | { kind: 'limit'; message: string }
  | { kind: 'error'; message: string };

/**
 * `/review?doc=<id>`: the real AI review of an uploaded document. Reuses the
 * document's newest review (a reload never pays twice), or starts one, then
 * polls until it is done or failed.
 */
export function ReviewScreen({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentWire | null>(null);
  const [versions, setVersions] = useState<DocumentVersionWire[]>([]);
  /** Set after accepting edits, just before moving to the new version. */
  const [created, setCreated] = useState<AcceptEditsResponse | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** The open finding, shared with the document pane, which highlights its clause. */
  const [selected, setSelected] = useState<string | null>(null);
  /** Small screens: the document pane is an overlay. */
  const [docOpen, setDocOpen] = useState(false);
  const retrying = useRef(false);
  const chat = useReviewChat(phase.kind === 'done' ? phase.review.id : null);
  const decisions = useEditDecisions({
    reviewId: phase.kind === 'done' ? phase.review.id : null,
    docx: doc ? doc.contentType === DOCX || doc.name.toLowerCase().endsWith('.docx') : false,
    latest: doc?.isLatest ?? false,
    onChanged: chat.refresh,
    onAccepted: (c) => {
      setCreated(c);
      billingChanged();
      // A moment to read "v2 yaratildi"; the new page shows its review running.
      setTimeout(() => router.push(`/review?doc=${c.documentId}`), 1200);
    },
  });

  useEffect(() => {
    let alive = true;
    getDocument(documentId)
      .then((d) => alive && setDoc(d))
      .catch((err) => alive && setPhase({ kind: 'error', message: loadErrorText(err, 'Hujjatni oçib bölmadi.') }));
    getVersions(documentId)
      .then((v) => alive && setVersions(v))
      .catch(() => {}); // the switcher is optional
    return () => {
      alive = false;
    };
  }, [documentId]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let alive = true;
    const begin = retrying.current ? startReview(documentId).then((r) => r.reviewId) : latestOrStartReview(documentId);
    retrying.current = false;

    begin
      .then((reviewId) => {
        if (!alive) return;
        billingChanged();
        stop = poll(
          () => getReview(reviewId),
          reviewFinished,
          (review) => {
            if (review.status === 'running') setRunningSince((t) => t ?? Date.now());
            if (review.status === 'done') setPhase({ kind: 'done', review });
            else if (review.status === 'failed') setPhase({ kind: 'failed', ...failureText(review.error) });
            else setPhase({ kind: 'waiting', review });
          },
          (err) => setPhase({ kind: 'error', message: loadErrorText(err, 'Tekşiruv holatini olib bölmadi.') }),
        );
      })
      .catch((err) => {
        if (!alive) return;
        if (isLimitError(err)) {
          showUpgrade(err.message);
          setPhase({ kind: 'limit', message: err.message });
        } else {
          setPhase({ kind: 'error', message: loadErrorText(err, 'Tekşiruvni boşlab bölmadi.') });
        }
      });

    return () => {
      alive = false;
      stop?.();
    };
  }, [documentId, attempt]);

  function retry() {
    retrying.current = true;
    setRunningSince(null);
    setPhase({ kind: 'waiting', review: null });
    setAttempt((n) => n + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:gap-3 sm:px-4">
        <FileIcon className="size-[18px] shrink-0 text-muted" />
        <div className="min-w-0 flex-1 truncate text-[15px] font-medium">{doc?.name ?? 'Hujjat'}</div>
        {versions.length > 1 ? (
          <nav aria-label="Versiyalar" className="flex shrink-0 items-center gap-0.5 rounded-full bg-subtle p-0.5 text-xs">
            {versions.map((v) => (
              <Link
                key={v.documentId}
                href={`/review?doc=${v.documentId}`}
                aria-current={v.documentId === documentId ? 'page' : undefined}
                className={`rounded-full px-2 py-0.5 ${
                  v.documentId === documentId ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                v{v.version}
              </Link>
            ))}
          </nav>
        ) : (
          doc &&
          doc.version > 1 && <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{doc.version}-versiya</span>
        )}
        {phase.kind === 'done' && doc?.isLatest && <SendForSigning doc={doc} />}
        {phase.kind === 'done' && (
          <button onClick={() => setDocOpen(true)} className="btn btn-secondary btn-sm shrink-0 lg:hidden">
            <FileIcon className="size-4" /> <span className="hidden sm:inline">Hujjat</span>
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
          {doc && !doc.isLatest && <OldVersion doc={doc} versions={versions} />}
          {(phase.kind === 'loading' || phase.kind === 'waiting') && (
            <Waiting review={phase.kind === 'waiting' ? phase.review : null} runningSince={runningSince} />
          )}
          {phase.kind === 'done' && (
            <Row>
              <ReviewFindings review={phase.review} selected={selected} onSelect={setSelected} />
            </Row>
          )}
          {phase.kind === 'done' && <ChatMessages chat={chat} decisions={decisions} />}
          {phase.kind === 'failed' && (
            <Notice
              title="Tekşiruv bajarilmadi"
              text={phase.reason}
              detail={phase.detail}
              action={
                <button onClick={retry} className="btn btn-primary btn-sm">
                  <RotateCcw className="size-3.5" /> Qayta urinib köriş
                </button>
              }
            />
          )}
          {phase.kind === 'limit' && (
            <Notice
              title="AI tekşiruvlar tugadi"
              text={phase.message}
              action={
                <Link href="/pricing" className="btn btn-primary btn-sm">
                  <Sparkles className="size-3.5" /> Tariflarni köriş
                </Link>
              }
            />
          )}
          {phase.kind === 'error' && (
            <Notice
              title="Xatolik"
              text={phase.message}
              action={
                <Link href="/contracts" className="btn btn-secondary btn-sm">
                  Hujjatlarga qaytiş
                </Link>
              }
            />
          )}
        </div>
      </div>
      {created && (
        <p role="status" className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">
          <CheckIcon className="size-4 shrink-0" />
          Yangi versiya (v{created.version}) yaratildi. Uni tekşirişga ötilmoqda…
        </p>
      )}
      {phase.kind === 'done' && <ChatComposer chat={chat} />}
      </section>

      {phase.kind === 'done' && (
        <ReviewDocument
          documentId={documentId}
          fileName={doc?.name ?? 'Hujjat'}
          issues={phase.review.issues}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            if (id) setDocOpen(false);
          }}
          open={docOpen}
          onClose={() => setDocOpen(false)}
        />
      )}
      </div>
    </div>
  );
}

/** The three steps, following the real status (queued → reading; running → searching, then comparing). */
function Waiting({ review, runningSince }: { review: ReviewWire | null; runningSince: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const step = review?.status !== 'running' ? 0 : runningSince && now - runningSince > 15_000 ? 2 : 1;
  return (
    <Row>
      <ol className="flex flex-col gap-2 text-sm" aria-live="polite">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2.5 ${i > step ? 'text-faint' : 'text-muted'}`}>
            {i < step ? (
              <CheckIcon className="size-4 text-success" />
            ) : i === step ? (
              <span className="size-4 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
            ) : (
              <span className="size-4 rounded-full border border-dashed border-line-strong" />
            )}
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-faint">Odatda 20–60 soniya. Sahifani yopsangiz ham tekşiruv davom etadi.</p>
    </Row>
  );
}

/** An older version: read-only, with a link to the newest one. */
function OldVersion({ doc, versions }: { doc: DocumentWire; versions: DocumentVersionWire[] }) {
  const newest = versions[versions.length - 1];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-subtle px-4 py-2.5 text-sm">
      <span className="flex-1 text-ink/80">
        Bu {doc.version}-versiya: faqat körish uçun. Tuzatişlar va imzo eng yangi versiyada.
      </span>
      {newest && newest.documentId !== doc.id && (
        <Link href={`/review?doc=${newest.documentId}`} className="btn btn-secondary btn-sm">
          v{newest.version} ni oçiş
        </Link>
      )}
    </div>
  );
}

function Notice({ title, text, detail, action }: { title: string; text: string; detail?: string; action: ReactNode }) {
  return (
    <Row>
      <div role="alert" className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4 text-warning" aria-hidden /> {title}
        </div>
        <p className="mt-1.5 text-sm text-ink/80">{text}</p>
        {detail && <p className="mt-1 text-xs text-faint">{detail}</p>}
        <div className="mt-3">{action}</div>
      </div>
    </Row>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-fade-up gap-3">
      <LogoMark className="mt-0.5 size-7 shrink-0 text-sm" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 403 / 404 mean the same to the user: no such document of theirs. Other errors keep a plain Uzbek line. */
function loadErrorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
    return 'Hujjat topilmadi yoki u sizga tegişli emas.';
  }
  return fallback;
}

/** The API's failure reasons are English and written for users; say them in Uzbek. */
function failureText(error: string | undefined): { reason: string; detail?: string } {
  const e = error ?? '';
  if (e.startsWith('The PDF file could not be read')) {
    return { reason: 'PDF faylni öqib bölmadi: u buzilgan yoki parol bilan himoyalangan bölişi mumkin.' };
  }
  if (e.startsWith('The file is a PDF, not a DOCX')) return { reason: 'Fayl aslida PDF, DOCX emas. Uni PDF sifatida yuklang.' };
  if (e.startsWith('Unsupported file type')) return { reason: 'Bu turdagi fayl qöllab-quvvatlanmaydi: PDF, DOCX yoki TXT yuklang.' };
  if (e.includes('OPENAI_API_KEY')) return { reason: 'AI hali sozlanmagan: serverda OPENAI_API_KEY yöq.' };
  return { reason: 'AI tekşiruvni yakunlay olmadi. Birozdan söng qayta urinib köring.', detail: e || undefined };
}

/** `/review` with no `?doc=`: pick a contract to check. */
export function ReviewStart() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    const problem = uploadError(file);
    setError(problem ?? '');
    if (problem) return;
    setBusy(true);
    try {
      router.replace(`/review?doc=${(await uploadForReview(file)).id}`);
    } catch (err) {
      setError(uploadErrorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid flex-1 place-items-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <UploadIcon className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-medium">Şartnomani tekşiring</h1>
        <p className="mt-2 text-ink/70">
          PDF, DOCX yoki TXT yuklang ({UPLOAD_MAX_MB} MB gaça). AI uni Özbekiston qonunlari bilan soliştirib, xavflarni
          manbasi bilan körsatadi.
        </p>
        <input
          ref={input}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button onClick={() => input.current?.click()} disabled={busy} className="btn btn-primary mt-6">
          {busy ? 'Yuklanmoqda…' : 'Hujjat yuklaş'}
        </button>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
