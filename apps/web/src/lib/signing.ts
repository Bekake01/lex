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
import demoDetail from '@lex/contracts/mocks/signing-request-detail.json';
import demoDraft from '@lex/contracts/mocks/signing-draft.json';
import demoList from '@lex/contracts/mocks/signing-request-list.json';
import { apiFetch, DEMO_LOGIN } from '@/lib/auth';

// Browser only, like lib/auth.ts. The sender's signing calls.
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
    const { recipients, ...rest } = body;
    demoState = {
      ...demoState,
      ...(rest as Partial<SigningRequestDetailWire>),
      ...(recipients
        ? {
            recipientCount: recipients.length,
            recipients: recipients.map((r, i) => ({
              id: `demo-recipient-${i}`,
              name: r.name ?? null,
              channel: r.channel,
              contact: r.contact ?? null,
              source: 'invite' as const,
              status: 'pending' as const,
              viewedAt: null,
              signedAt: null,
              signUrl: `http://localhost:3001/sign/demo-token-${i}`,
              ready: false,
              signerName: null,
              fieldValues: {},
            })),
          }
        : {}),
    };
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

/* ------------------------------------------------------- send + after it -- */

const DEMO_SENT_ID = (demoDetail as SigningRequestDetailWire).id;

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
  if (isDemo(id)) {
    const base = id === DEMO_DRAFT_ID ? demoState : getDemoSent();
    const next: SigningRequestDetailWire = {
      ...base,
      ...(body.openLinkEnabled !== undefined
        ? {
            openLinkEnabled: body.openLinkEnabled,
            openLinkUrl: body.openLinkEnabled ? 'http://localhost:3001/open/demo-open-link-token' : null,
          }
        : {}),
      ...(body.password !== undefined ? { hasPassword: body.password !== null } : {}),
    };
    if (id === DEMO_DRAFT_ID) demoState = next;
    else demoSent = next;
    return next;
  }
  return json(await apiFetch(SIGNING_ROUTES.requestAccess(id), patchJson(body)));
}

/** Send the draft: every link comes back. */
export async function sendDraft(id: string): Promise<SendSigningResponse> {
  if (isDemo(id)) {
    return {
      id: DEMO_SENT_ID,
      recipients: demoState.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        channel: r.channel,
        contact: r.contact,
        signUrl: r.signUrl,
      })),
      openLinkUrl: demoState.openLinkUrl,
    };
  }
  return json(await apiFetch(SIGNING_ROUTES.requestSend(id), postJson()));
}

/** More people on a sent send; their links come back. */
export async function addRecipients(id: string, body: AddRecipientsBody): Promise<SendSigningResponse> {
  if (isDemo(id)) {
    return {
      id,
      recipients: body.recipients.map((r, i) => ({
        id: `demo-new-${Date.now()}-${i}`,
        name: r.name ?? null,
        channel: r.channel,
        contact: r.contact ?? null,
        signUrl: `http://localhost:3001/sign/demo-token-${Date.now()}-${i}`,
      })),
      openLinkUrl: null,
    };
  }
  return json(await apiFetch(SIGNING_ROUTES.requestRecipients(id), postJson(body)));
}

export async function cancelSend(id: string): Promise<SigningRequestDetailWire> {
  if (isDemo(id)) return (demoSent = { ...getDemoSent(), status: 'cancelled' });
  return json(await apiFetch(SIGNING_ROUTES.requestCancel(id), postJson()));
}

let demoSent: SigningRequestDetailWire | null = null;
function getDemoSent(): SigningRequestDetailWire {
  return (demoSent ??= demoDetail as SigningRequestDetailWire);
}

/** A send with everyone in it (any status). */
export async function getSend(id: string): Promise<SigningRequestDetailWire> {
  if (isDemo(id)) return id === DEMO_DRAFT_ID ? demoState : getDemoSent();
  return json(await apiFetch(SIGNING_ROUTES.request(id)));
}

/** `sent`: my sends (drafts included). `inbox`: sends where my email is a recipient. */
export async function listSends(box: SigningBox): Promise<SigningRequestList> {
  if (DEMO_LOGIN) {
    const rows = (demoList as SigningRequestList).requests;
    return { requests: box === 'sent' ? rows : [] };
  }
  return json(await apiFetch(SIGNING_ROUTES.requestList(box)));
}

/** My documents, latest versions only. */
export async function listDocuments(): Promise<DocumentList> {
  if (DEMO_LOGIN) return { documents: [] };
  return json(await apiFetch(API_PATHS.documents));
}

/** The contract parties the AI review found (empty without a review). */
export async function documentParties(documentId: string): Promise<PartyWire[]> {
  if (DEMO_LOGIN) return [];
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
  if (isDemo(id)) throw new ApiError(404, undefined, 'Demo rejimida yuklab bölmaydi');
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
