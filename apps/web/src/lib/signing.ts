import {
  SIGNING_ROUTES,
  type CreateSigningDraftBody,
  type SigningRequestDetailWire,
  type UpdateSigningDraftBody,
} from '@lex/contracts';
import demoDraft from '@lex/contracts/mocks/signing-draft.json';
import { apiFetch, DEMO_LOGIN } from '@/lib/auth';

// Browser only, like lib/auth.ts. The sender's signing calls (phase 05 API).
// With NEXT_PUBLIC_DEMO_LOGIN=1 nothing goes to the API: the draft is the
// contracts mock and the PDF is public/demo.pdf, so the editor works offline.

/** The id the demo draft answers to (`/documents/send/demo`). */
export const DEMO_DRAFT_ID = 'demo';

/** A failed API call, with the server's `code` when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: unknown };
  const message = typeof body.message === 'string' ? body.message : `Xatolik (${res.status})`;
  throw new ApiError(res.status, body.code, message);
}

const isDemo = (id: string) => DEMO_LOGIN || id === DEMO_DRAFT_ID;

/** The demo draft on the 2-page demo PDF; edits live in this tab only. */
let demoState: SigningRequestDetailWire = {
  ...(demoDraft as SigningRequestDetailWire),
  id: DEMO_DRAFT_ID,
  pageCount: 2,
  pageSizes: [
    { w: 595, h: 842 },
    { w: 595, h: 842 },
  ],
};

export async function getDraft(id: string): Promise<SigningRequestDetailWire> {
  if (isDemo(id)) return demoState;
  return json(await apiFetch(SIGNING_ROUTES.request(id)));
}

export async function updateDraft(
  id: string,
  body: UpdateSigningDraftBody,
): Promise<SigningRequestDetailWire> {
  if (isDemo(id)) {
    demoState = { ...demoState, ...(body as Partial<SigningRequestDetailWire>) };
    return demoState;
  }
  return json(
    await apiFetch(SIGNING_ROUTES.request(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** The original PDF of a draft's document, as bytes for pdf.js. */
export async function documentPdf(draft: SigningRequestDetailWire): Promise<ArrayBuffer> {
  if (isDemo(draft.id)) {
    const res = await fetch('/demo.pdf');
    if (!res.ok) throw new Error('demo.pdf missing');
    return res.arrayBuffer();
  }
  const res = await apiFetch(SIGNING_ROUTES.documentFile(draft.documentId));
  if (!res.ok) throw new ApiError(res.status, undefined, 'PDF yuklanmadi');
  return res.arrayBuffer();
}

/** Upload a file (`POST /documents`) and return its id. */
export async function uploadDocument(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const doc = await json<{ id: string }>(await apiFetch('/documents', { method: 'POST', body: form }));
  return doc.id;
}

/** A draft from an uploaded PDF (`POST /signature-requests`). 415 `PDF_ONLY` for anything else. */
export async function createDraft(documentId: string): Promise<SigningRequestDetailWire> {
  const body: CreateSigningDraftBody = { documentId };
  return json(
    await apiFetch(SIGNING_ROUTES.requests, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** Upload → draft; in demo mode straight to the demo draft. */
export async function startSending(file: File): Promise<{ documentId?: string; draftId: string }> {
  if (DEMO_LOGIN) return { draftId: DEMO_DRAFT_ID };
  const documentId = await uploadDocument(file);
  return { documentId, draftId: (await createDraft(documentId)).id };
}

/** What to tell the user when starting a send failed. */
export function sendStartError(err: unknown): string {
  if (err instanceof ApiError && (err.code === 'PDF_ONLY' || err.status === 415)) {
    return 'Faqat PDF yuboriş mumkin — Word faylni PDF ga aylantirib yuklang (Fayl → PDF sifatida saqlaş).';
  }
  if (err instanceof ApiError) return err.message;
  return 'Xatolik yuz berdi. Qaytadan urinib köring.';
}
