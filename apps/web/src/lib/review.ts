import {
  API_PATHS,
  type AcceptEditsResponse,
  type CreateMessageResponse,
  type CreateReviewResponse,
  type DocumentTextWire,
  type DocumentVersionWire,
  type DocumentWire,
  type RejectEditsResponse,
  type ReviewMessageWire,
  type ReviewWire,
} from '@lex/contracts';
import demoDocument from '@lex/contracts/mocks/document.json';
import demoText from '@lex/contracts/mocks/document-text.json';
import demoMessages from '@lex/contracts/mocks/review-messages.json';
import demoReviewDone from '@lex/contracts/mocks/review-done.json';
import demoVersions from '@lex/contracts/mocks/versions.json';
import { apiFetch, DEMO_LOGIN } from '@/lib/auth';
import { ApiError } from '@/lib/signing';

// Browser only, like lib/auth.ts. The AI review routes for `/review`
// (plan: docs/review-wiring-plan.md). Every call throws ApiError with the
// server's `code` and user-facing `message` on failure.
//
// With NEXT_PUBLIC_DEMO_LOGIN=1 nothing goes to the API: answers come from
// `@lex/contracts/mocks`, and the review / chat "finish" after a few seconds
// so the waiting states can be seen.

export { ApiError };

/** A review stops changing once it is `done` or `failed`. */
export const reviewFinished = (r: ReviewWire) => r.status === 'done' || r.status === 'failed';

/** The chat is settled once no assistant message is still `pending`. */
export const messagesSettled = (ms: ReviewMessageWire[]) => !ms.some((m) => m.status === 'pending');

async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: unknown };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new ApiError(res.status, body.code, typeof message === 'string' ? message : `Xatolik (${res.status})`);
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/* ------------------------------------------------------------- documents -- */

/**
 * `POST /documents`: upload a contract (PDF, DOCX or text, 20 MB). 413 / 415
 * carry a message written for the user.
 */
export async function uploadForReview(file: File): Promise<DocumentWire> {
  if (DEMO_LOGIN) return { ...(demoDocument as DocumentWire), name: file.name };
  const form = new FormData();
  form.append('file', file);
  return json(await apiFetch(API_PATHS.documents, { method: 'POST', body: form }));
}

/** A failed upload, in Uzbek (the API's 413 / 415 messages are English). */
export function uploadErrorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 413) return 'Fayl juda katta — 20 MB gaça bölişi kerak.';
  if (err instanceof ApiError && err.status === 415) {
    return 'Bu fayl haqiqiy PDF, DOCX yoki TXT emas. Faylni qayta saqlab yuklang.';
  }
  return errorText(err, 'Faylni yuklab bölmadi. Qayta urinib köring.');
}

export async function getDocument(id: string): Promise<DocumentWire> {
  if (DEMO_LOGIN) return { ...(demoDocument as DocumentWire), id };
  return json(await apiFetch(API_PATHS.document(id)));
}

/** Text + clause offsets for the left pane. 409 DOCUMENT_NOT_READ before the first review. */
export async function getDocumentText(id: string): Promise<DocumentTextWire> {
  if (DEMO_LOGIN) return { ...(demoText as DocumentTextWire), documentId: id };
  return json(await apiFetch(API_PATHS.documentText(id)));
}

/** Every version of the document, oldest first. */
export async function getVersions(id: string): Promise<DocumentVersionWire[]> {
  if (DEMO_LOGIN) return demoVersions as DocumentVersionWire[];
  return json(await apiFetch(API_PATHS.documentVersions(id)));
}

/* --------------------------------------------------------------- reviews -- */

/** The document's reviews, newest first. */
export async function listReviews(documentId: string): Promise<ReviewWire[]> {
  if (DEMO_LOGIN) return demo.review ? [demo.review] : [];
  return json(await apiFetch(API_PATHS.documentReviews(documentId)));
}

/** Starts a review (charges one AI check). 402 REVIEW_LIMIT_REACHED when none are left. */
export async function startReview(documentId: string): Promise<CreateReviewResponse> {
  if (DEMO_LOGIN) {
    demo.review = { ...(demoReviewDone as ReviewWire), documentId, status: 'queued', issues: [] };
    demo.reviewPolls = 0;
    return { reviewId: demo.review.id };
  }
  return json(await apiFetch(API_PATHS.documentReviews(documentId), postJson({ language: 'uz' })));
}

/**
 * The newest review of a document, or a new one when it has none (or only
 * failed ones). A reload therefore never pays for a second review.
 */
export async function latestOrStartReview(documentId: string): Promise<string> {
  const [latest] = await listReviews(documentId);
  if (latest && latest.status !== 'failed') return latest.id;
  return (await startReview(documentId)).reviewId;
}

export async function getReview(id: string): Promise<ReviewWire> {
  if (DEMO_LOGIN) return demoReview(id);
  return json(await apiFetch(API_PATHS.review(id)));
}

/* ------------------------------------------------------------------ chat -- */

export async function getMessages(reviewId: string): Promise<ReviewMessageWire[]> {
  if (DEMO_LOGIN) return demoChat();
  return json(await apiFetch(API_PATHS.reviewMessages(reviewId)));
}

/** Asks the AI (a correction or a question). Poll getMessages until settled. */
export async function sendMessage(reviewId: string, text: string): Promise<CreateMessageResponse> {
  if (DEMO_LOGIN) return demoSend(text);
  return json(await apiFetch(API_PATHS.reviewMessages(reviewId), postJson({ text })));
}

/**
 * Applies edits to the Word file: makes version + 1 and starts its review.
 * Open `/review?doc=<documentId>` next. 422 EDITS_NEED_DOCX / EDIT_NOT_APPLICABLE.
 */
export async function acceptEdits(reviewId: string, editIds: string[]): Promise<AcceptEditsResponse> {
  if (DEMO_LOGIN) {
    const v2 = (demoVersions as DocumentVersionWire[])[1];
    return { documentId: v2.documentId, version: v2.version };
  }
  return json(await apiFetch(API_PATHS.acceptEdits(reviewId), postJson({ editIds })));
}

export async function rejectEdits(reviewId: string, editIds: string[]): Promise<RejectEditsResponse> {
  if (DEMO_LOGIN) {
    demo.messages = demoChat().map((m) => ({
      ...m,
      edits: m.edits.map((e) => (editIds.includes(e.id) ? { ...e, status: 'rejected' as const } : e)),
    }));
    return { rejected: editIds.length };
  }
  return json(await apiFetch(API_PATHS.rejectEdits(reviewId), postJson({ editIds })));
}

/* --------------------------------------------------------------- polling -- */

export interface PollOptions {
  /** Default 2 s. */
  everyMs?: number;
  /** After this long, poll every `slowEveryMs` instead. Default 60 s. */
  slowAfterMs?: number;
  /** Default 5 s. */
  slowEveryMs?: number;
}

/**
 * Calls `load` until `isDone(value)`, handing every value to `onValue`.
 * Network or 5xx errors are retried (3 in a row → `onError`); a 4xx stops at
 * once. Returns `stop`, for a `useEffect` cleanup.
 */
export function poll<T>(
  load: () => Promise<T>,
  isDone: (value: T) => boolean,
  onValue: (value: T) => void,
  onError: (err: unknown) => void,
  { everyMs = 2000, slowAfterMs = 60_000, slowEveryMs = 5000 }: PollOptions = {},
): () => void {
  const started = Date.now();
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const next = () => {
    if (stopped) return;
    timer = setTimeout(tick, Date.now() - started > slowAfterMs ? slowEveryMs : everyMs);
  };

  async function tick() {
    try {
      const value = await load();
      if (stopped) return;
      failures = 0;
      onValue(value);
      if (!isDone(value)) next();
    } catch (err) {
      if (stopped) return;
      const clientError = err instanceof ApiError && err.status >= 400 && err.status < 500;
      if (clientError || ++failures >= 3) {
        onError(err);
        return;
      }
      next();
    }
  }

  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** What to tell the user about a failed call: the server's message, or a generic one. */
export function errorText(err: unknown, fallback = 'Xatolik yuz berdi. Qayta urinib köring.'): string {
  return err instanceof ApiError ? err.message : fallback;
}

/* ------------------------------------------------------------ demo state -- */

const demo: {
  review: ReviewWire | null;
  reviewPolls: number;
  messages: ReviewMessageWire[] | null;
  chatPolls: number;
} = { review: null, reviewPolls: 0, messages: null, chatPolls: 0 };

/** queued → running → done over a few polls, like a real review. */
function demoReview(id: string): ReviewWire {
  const done = demoReviewDone as ReviewWire;
  if (!demo.review || demo.review.id !== id) return { ...done, id };
  demo.reviewPolls += 1;
  if (demo.reviewPolls >= 4) demo.review = { ...done, id, documentId: demo.review.documentId };
  else if (demo.reviewPolls >= 1) demo.review = { ...demo.review, status: 'running' };
  return demo.review;
}

function demoChat(): ReviewMessageWire[] {
  demo.messages ??= [];
  // A pending answer "arrives" on the second poll, with the mock's edits.
  const pending = demo.messages.find((m) => m.status === 'pending');
  if (pending && ++demo.chatPolls >= 2) {
    const answer = (demoMessages as ReviewMessageWire[]).find((m) => m.role === 'assistant');
    demo.messages = demo.messages.map((m) =>
      m.id === pending.id && answer ? { ...answer, id: m.id, createdAt: m.createdAt } : m,
    );
  }
  return demo.messages;
}

function demoSend(text: string): CreateMessageResponse {
  const now = new Date().toISOString();
  const n = (demo.messages?.length ?? 0) + 1;
  demo.messages = [
    ...demoChat(),
    { id: `demo-user-${n}`, role: 'user', text, status: 'done', edits: [], createdAt: now },
    { id: `demo-ai-${n}`, role: 'assistant', text: '', status: 'pending', edits: [], createdAt: now },
  ];
  demo.chatPolls = 0;
  return { messageId: `demo-ai-${n}` };
}
