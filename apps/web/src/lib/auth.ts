import { API_URL } from '@/lib/env';
import { SIGNED_IN_COOKIE } from '@/lib/signed-in';

// Browser only: call these from client components and event handlers, never
// during server rendering (they use `document` and module-level state that
// would be shared between users on the server).

/** The signed-in user, as login and refresh return it. */
export type SessionUser = { id: string; email: string; fullName: string };

/** Body of a successful POST /auth/login or /auth/refresh. */
type SignedIn = {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
};

/** The session ended (refresh refused): the user must sign in again. */
export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
    this.name = 'SignedOutError';
  }
}

/** Matches the API's 30-day absolute session limit (SESSION_ABSOLUTE_MS). */
const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Refresh this long before the access token expires. */
const REFRESH_EARLY_MS = 60 * 1000;

// The access token lives only here, in memory: gone on reload, out of reach of
// storage-reading scripts. /auth/refresh gets a new one from the httpOnly cookie.
let session: SignedIn | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshing: Promise<SignedIn | null> | null = null;
const signedOutListeners = new Set<(reason: SignOutReason) => void>();

/**
 * Why the session ended: `logout` from this tab, `elsewhere` from another tab
 * of this app (logout or a refused refresh), `expired` when the API refused
 * the refresh here.
 */
export type SignOutReason = 'logout' | 'elsewhere' | 'expired';

/** The signed-in user, or null before the first sign-in or refresh. */
export function currentUser(): SessionUser | null {
  return session?.user ?? null;
}

/**
 * True once this tab holds an access token, getting one with the refresh
 * cookie first if needed (after a reload). False when the session is over;
 * throws on network or server errors, which don't mean the user is signed out.
 */
export async function ensureSession(): Promise<boolean> {
  return session !== null || (await refreshSession()) !== null;
}

/**
 * Gets a new access token with the refresh cookie. Resolves to null when the
 * session is over (and clears it); throws on network or server errors.
 *
 * Only one refresh runs at a time: the API rotates the cookie on every
 * refresh, so parallel calls share the same request instead of racing.
 */
export function refreshSession(): Promise<SignedIn | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<SignedIn | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401 || res.status === 403) {
    endSession('expired');
    return null;
  }
  if (!res.ok) {
    throw new Error(`POST /auth/refresh failed: ${res.status}`);
  }
  const signedIn = (await res.json()) as SignedIn;
  keep(signedIn);
  return signedIn;
}

/**
 * fetch() for the API with the access token. Gets a token first if there is
 * none (after a reload), and on a 401 refreshes once and retries. Throws
 * SignedOutError when the session is over. The retry resends `init.body`, so
 * use a string or FormData body, not a stream.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = session?.accessToken ?? (await requireRefresh()).accessToken;
  const res = await send(path, init, token);
  if (res.status !== 401) {
    return res;
  }
  // Another call may have refreshed while this one was in flight.
  const retryToken =
    session && session.accessToken !== token
      ? session.accessToken
      : (await requireRefresh()).accessToken;
  const retry = await send(path, init, retryToken);
  if (retry.status === 401) {
    endSession('expired');
    throw new SignedOutError();
  }
  return retry;
}

function send(path: string, init: RequestInit, token: string) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

async function requireRefresh(): Promise<SignedIn> {
  const signedIn = await refreshSession();
  if (!signedIn) {
    throw new SignedOutError();
  }
  return signedIn;
}

/**
 * POST /auth/login. On success the token is kept and `signed_in` is set.
 * Errors come back as a message to show, never thrown.
 */
export async function login(credentials: {
  email: string;
  password: string;
  rememberMe: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  let res: Response;
  try {
    // credentials: the browser stores the refresh cookie the API sets.
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    return {
      ok: false,
      message: "Can't reach Cralex. Check your connection and try again.",
    };
  }
  if (!res.ok) {
    return { ok: false, message: await errorMessage(res) };
  }
  keep((await res.json()) as SignedIn);
  setSignedInCookie(credentials.rememberMe);
  return { ok: true };
}

/**
 * POST /auth/register (sign-up, free plan) or POST /invites/:token/accept
 * (join a company). Both answer like login: the token is kept and
 * `signed_in` is set. Errors come back as a message to show.
 */
export function register(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  return signInAt('/auth/register', { ...input, rememberMe: true }, true);
}

export function acceptInvite(
  token: string,
  input: { password: string; fullName?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  return signInAt(`/invites/${encodeURIComponent(token)}/accept`, input, false);
}

async function signInAt(
  path: string,
  body: unknown,
  rememberMe: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: 'Cralex bilan aloqa yöq. Internetni tekşirib, qayta urinib köring.' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message = Array.isArray(data?.message) ? data?.message.join(', ') : data?.message;
    return {
      ok: false,
      message: typeof message === 'string' ? toUzbekError(message) : 'Xatolik yuz berdi. Qayta urinib köring.',
    };
  }
  keep((await res.json()) as SignedIn);
  setSignedInCookie(rememberMe);
  return { ok: true };
}

/** The API's English validation messages, as users should read them. */
function toUzbekError(message: string): string {
  if (message.startsWith('password must be at least')) return 'Parol kamida 8 ta belgidan iborat bölsin.';
  if (message === 'email is invalid' || message === 'email is required') return 'Emailni tögri kiriting.';
  if (message === 'fullName is required') return 'Ismingizni kiriting.';
  if (message === 'Invalid email or password') return 'Parol notögri.';
  return message;
}

/**
 * What to tell the user about a failed login. 401 and 403 carry the API's
 * fixed messages ("Invalid email or password", "Your account is suspended"),
 * which are written for users.
 */
async function errorMessage(res: Response): Promise<string> {
  if (res.status === 400) {
    return 'Enter a valid email and password.';
  }
  const body = (await res.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  if (
    (res.status === 401 || res.status === 403) &&
    typeof body?.message === 'string'
  ) {
    return body.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Ends the session on the API (always succeeds there) and in this tab. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    endSession('logout');
  }
}

/**
 * Called whenever the session ends, in this tab or another one, so the app
 * can go to /login.
 */
export function onSignedOut(
  listener: (reason: SignOutReason) => void,
): () => void {
  listenToOtherTabs();
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

function keep(signedIn: SignedIn): void {
  session = signedIn;
  clearTimeout(refreshTimer);
  const delay = Math.max(signedIn.expiresIn * 1000 - REFRESH_EARLY_MS, 0);
  refreshTimer = setTimeout(() => {
    // A failure here is retried by the next apiFetch() that gets a 401.
    refreshSession().catch(() => undefined);
  }, delay);
}

function endSession(reason: SignOutReason): void {
  const hadSession = session !== null || hasSignedInCookie();
  session = null;
  clearTimeout(refreshTimer);
  deleteSignedInCookie();
  if (reason !== 'elsewhere') {
    // The refresh cookie is shared, so the other tabs' sessions are over too.
    authChannel()?.postMessage(SIGNED_OUT_MESSAGE);
  }
  if (hadSession || reason === 'elsewhere') {
    for (const listener of signedOutListeners) {
      listener(reason);
    }
  }
}

// Tabs of this app tell each other about sign-out. Created on first use, in
// the browser only.
const SIGNED_OUT_MESSAGE = 'signed-out';
let channel: BroadcastChannel | null | undefined;

function authChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel =
      typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('lex-auth')
        : null;
  }
  return channel;
}

let listeningToOtherTabs = false;

function listenToOtherTabs(): void {
  const tabs = authChannel();
  if (!tabs || listeningToOtherTabs) return;
  listeningToOtherTabs = true;
  tabs.addEventListener('message', (event: MessageEvent) => {
    if (event.data === SIGNED_OUT_MESSAGE) {
      endSession('elsewhere');
    }
  });
}

function setSignedInCookie(rememberMe: boolean): void {
  // No Max-Age: a browser-session cookie, like the refresh cookie without
  // "remember me".
  const maxAge = rememberMe ? `; Max-Age=${REMEMBER_ME_MAX_AGE_SECONDS}` : '';
  document.cookie = `${SIGNED_IN_COOKIE}=1; Path=/; SameSite=Lax${maxAge}${secure()}`;
}

function deleteSignedInCookie(): void {
  document.cookie = `${SIGNED_IN_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure()}`;
}

function hasSignedInCookie(): boolean {
  return document.cookie
    .split(';')
    .some((part) => part.trim() === `${SIGNED_IN_COOKIE}=1`);
}

/** Secure everywhere but http://localhost, where Safari would drop the cookie. */
function secure(): string {
  return location.protocol === 'https:' ? '; Secure' : '';
}
