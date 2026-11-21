import {
  API_PATHS,
  SIGNING_ROUTES,
  type AddRecipientsBody,
  type CreateSigningDraftBody,
  type DocumentList,
  type PartyWire,
  type SendSigningResponse,
  type SigningBox,
  type SigningRequestDetailWire,
  type SigningRequestList,
  type UpdateSigningAccessBody,
  type UpdateSigningDraftBody,
} from '@lex/contracts';
import { apiFetch } from '@/lib/auth';

// Browser only, like lib/auth.ts. The sender's signing calls.

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

export async function getDraft(id: string): Promise<SigningRequestDetailWire> {
  return json(await apiFetch(SIGNING_ROUTES.request(id)));
}

export async function updateDraft(
  id: string,
  body: UpdateSigningDraftBody,
): Promise<SigningRequestDetailWire> {
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

/** Upload → draft. */
export async function startSending(file: File): Promise<{ documentId?: string; draftId: string }> {
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

/* ------------------------------------------------------- send + after it -- */

function patchJson(body: unknown): RequestInit {
  return { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function postJson(body?: unknown): RequestInit {
  return {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

/** Open link on/off and the password (`PATCH …/access`). */
export async function updateAccess(id: string, body: UpdateSigningAccessBody): Promise<SigningRequestDetailWire> {
  return json(await apiFetch(SIGNING_ROUTES.requestAccess(id), patchJson(body)));
}

/** Send the draft: every link comes back. */
export async function sendDraft(id: string): Promise<SendSigningResponse> {
  return json(await apiFetch(SIGNING_ROUTES.requestSend(id), postJson()));
}

/** More people on a sent send; their links come back. */
export async function addRecipients(id: string, body: AddRecipientsBody): Promise<SendSigningResponse> {
  return json(await apiFetch(SIGNING_ROUTES.requestRecipients(id), postJson(body)));
}

export async function cancelSend(id: string): Promise<SigningRequestDetailWire> {
  return json(await apiFetch(SIGNING_ROUTES.requestCancel(id), postJson()));
}

/** A send with everyone in it (any status). */
export async function getSend(id: string): Promise<SigningRequestDetailWire> {
  return json(await apiFetch(SIGNING_ROUTES.request(id)));
}

/** `sent`: my sends (drafts included). `inbox`: sends where my email is a recipient. */
export async function listSends(box: SigningBox): Promise<SigningRequestList> {
  return json(await apiFetch(SIGNING_ROUTES.requestList(box)));
}

/** My documents, latest versions only. */
export async function listDocuments(): Promise<DocumentList> {
  return json(await apiFetch(API_PATHS.documents));
}

/** The contract parties the AI review found (empty without a review). */
export async function documentParties(documentId: string): Promise<PartyWire[]> {
  try {
    return await json<PartyWire[]>(await apiFetch(API_PATHS.documentParties(documentId)));
  } catch {
    return [];
  }
}

/**
 * Save a signed copy or certificate. A plain `<a href>` has no auth header,
 * so: fetch with the token → blob → object URL → click.
 */
export async function downloadCopy(
  id: string,
  recipientId: string,
  kind: 'signed' | 'certificate',
  fileName: string,
): Promise<void> {
  const path =
    kind === 'signed'
      ? SIGNING_ROUTES.recipientSigned(id, recipientId)
      : SIGNING_ROUTES.recipientCertificate(id, recipientId);
  const res = await apiFetch(path);
  if (!res.ok) throw new ApiError(res.status, undefined, 'Fayl hali tayyor emas');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
