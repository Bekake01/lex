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
  SIGNING_ROUTES,
} from '@lex/contracts';
import { apiFetch } from '@/lib/auth';
import { ApiError } from '@/lib/signing';

// Browser only, like lib/auth.ts. The AI review routes for `/review`.
// Every call throws ApiError with the
// server's `code` and user-facing `message` on failure.

export { ApiError };

/** A review stops changing once it is `done` or `failed`. */
export const reviewFinished = (r: ReviewWire) => r.status === 'done' || r.status === 'failed';

/** The chat is settled once no assistant message is still `pending`. */
export const messagesSettled = (ms: ReviewMessageWire[]) => !ms.some((m) => m.status === 'pending');

export async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: unknown };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new ApiError(res.status, body.code, typeof message === 'string' ? message : `Xatolik (${res.status})`);
}

export const postJson = (body: unknown): RequestInit => ({
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
  return json(await apiFetch(API_PATHS.document(id)));
}

/** Text + clause offsets for the left pane. 409 DOCUMENT_NOT_READ before the first review. */
export async function getDocumentText(id: string): Promise<DocumentTextWire> {
  return json(await apiFetch(API_PATHS.documentText(id)));
}

/** The uploaded file's bytes (`GET /documents/:id/file`), e.g. a scanned PDF for pdf.js. */
export async function getDocumentFile(id: string): Promise<ArrayBuffer> {
  const res = await apiFetch(SIGNING_ROUTES.documentFile(id));
  if (!res.ok) await json(res);
  return res.arrayBuffer();
}

/** Every version of the document, oldest first. */
export async function getVersions(id: string): Promise<DocumentVersionWire[]> {
  return json(await apiFetch(API_PATHS.documentVersions(id)));
}

/* --------------------------------------------------------------- reviews -- */

/** The document's reviews, newest first. */
export async function listReviews(documentId: string): Promise<ReviewWire[]> {
  return json(await apiFetch(API_PATHS.documentReviews(documentId)));
}

/** Starts a review (charges one AI check). 402 REVIEW_LIMIT_REACHED when none are left. */
export async function startReview(documentId: string): Promise<CreateReviewResponse> {
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
  return json(await apiFetch(API_PATHS.review(id)));
}

/* ------------------------------------------------------------------ chat -- */

export async function getMessages(reviewId: string): Promise<ReviewMessageWire[]> {
  return json(await apiFetch(API_PATHS.reviewMessages(reviewId)));
}

/** Asks the AI (a correction or a question). Poll getMessages until settled. */
export async function sendMessage(reviewId: string, text: string): Promise<CreateMessageResponse> {
  return json(await apiFetch(API_PATHS.reviewMessages(reviewId), postJson({ text })));
}

/**
 * Applies edits to the Word file: makes version + 1 and starts its review.
 * Open `/review?doc=<documentId>` next. 422 EDITS_NEED_DOCX / EDIT_NOT_APPLICABLE.
 */
export async function acceptEdits(reviewId: string, editIds: string[]): Promise<AcceptEditsResponse> {
  return json(await apiFetch(API_PATHS.acceptEdits(reviewId), postJson({ editIds })));
}

export async function rejectEdits(reviewId: string, editIds: string[]): Promise<RejectEditsResponse> {
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
