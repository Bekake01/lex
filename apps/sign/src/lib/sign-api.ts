import { SIGN_TICKET_HEADER } from '@lex/contracts';

/**
 * Browser calls for the signing pages. Everything goes through this app's own
 * pass-through (`/api/sign/...`). A password ticket is kept per link in
 * sessionStorage and sent on every call.
 */

const ticketKey = (token: string) => `lex-ticket:${token}`;

export function getTicket(token: string): string | null {
  try {
    return sessionStorage.getItem(ticketKey(token));
  } catch {
    return null;
  }
}

export function saveTicket(token: string, ticket: string): void {
  try {
    sessionStorage.setItem(ticketKey(token), ticket);
  } catch {
    // Private mode: the password is asked again next time.
  }
}

export class SignApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

/** `/api` + a `SIGNING_ROUTES` path, with the ticket for `token` if there is one. */
export async function signFetch(
  path: string,
  token: string | null,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  const ticket = token ? getTicket(token) : null;
  if (ticket) headers[SIGN_TICKET_HEADER] = ticket;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (!res.ok) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const err = (await res.json()) as { code?: string; message?: string };
      code = err.code;
      message = typeof err.message === 'string' ? err.message : undefined;
    } catch {
      // not JSON
    }
    throw new SignApiError(res.status, code, message);
  }
  return res;
}

export async function signJson<T>(
  path: string,
  token: string | null,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const res = await signFetch(path, token, init);
  return (await res.json()) as T;
}

/** Download a file the API streams (fetch → blob, so the ticket header goes along). */
export async function downloadFile(path: string, token: string, fallbackName: string): Promise<void> {
  const res = await signFetch(path, token);
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const name = star ? decodeURIComponent(star) : (plain ?? fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
