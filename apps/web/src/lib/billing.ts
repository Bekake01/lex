import {
  BILLING_ROUTES,
  type BillingOverviewWire,
  type CheckoutBody,
  type InvitePreviewWire,
  type PaymentWire,
  type TeamInviteWire,
  type TeamWire,
} from '@lex/contracts';
import { apiFetch } from '@/lib/auth';
import { API_URL } from '@/lib/env';
import { ApiError } from '@/lib/signing';

// Browser only, like lib/auth.ts. Plans, test payments and the team.

async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: unknown };
  const message = typeof body.message === 'string' ? body.message : `Xatolik (${res.status})`;
  throw new ApiError(res.status, body.code, message);
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const getOverview = async () => json<BillingOverviewWire>(await apiFetch(BILLING_ROUTES.me));
export const getPayments = async () => json<PaymentWire[]>(await apiFetch(BILLING_ROUTES.payments));
export const checkout = async (body: CheckoutBody) =>
  json<BillingOverviewWire>(await apiFetch(BILLING_ROUTES.checkout, send('POST', body)));
export const cancelPlan = async () => json<BillingOverviewWire>(await apiFetch(BILLING_ROUTES.cancel, send('POST')));
export const resumePlan = async () => json<BillingOverviewWire>(await apiFetch(BILLING_ROUTES.resume, send('POST')));
export const changeSeats = async (seats: number) =>
  json<BillingOverviewWire>(await apiFetch(BILLING_ROUTES.seats, send('PATCH', { seats })));

export const getTeam = async () => json<TeamWire>(await apiFetch(BILLING_ROUTES.team));
export const inviteMember = async (email: string, role: 'admin' | 'member') =>
  json<TeamInviteWire>(await apiFetch(BILLING_ROUTES.teamInvites, send('POST', { email, role })));
export const revokeInvite = async (id: string) => json<void>(await apiFetch(BILLING_ROUTES.teamInvite(id), send('DELETE')));
export const removeMember = async (id: string) => json<void>(await apiFetch(BILLING_ROUTES.teamMember(id), send('DELETE')));
export const changeRole = async (id: string, role: 'admin' | 'member') =>
  json<void>(await apiFetch(BILLING_ROUTES.teamMember(id), send('PATCH', { role })));

/** Public: what an invite link is for (no sign-in). */
export async function previewInvite(token: string): Promise<InvitePreviewWire> {
  return json<InvitePreviewWire>(await fetch(`${API_URL}${BILLING_ROUTES.invite(encodeURIComponent(token))}`));
}

/** "1 250 000 söm" */
export function formatSom(amount: number): string {
  return `${amount.toLocaleString('ru-RU').replace(/ /g, ' ')} söm`;
}

/** "21-dekabr 2026" style local date. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const ROLE_LABEL = { owner: 'Egasi', admin: 'Admin', member: 'Aʼzo' } as const;

/* ------------------------------------------------------ upgrade prompt -- */

const UPGRADE_EVENT = 'lex:upgrade';

/**
 * Opens the upgrade dialog (mounted once in the signed-in layout). Call it
 * when the API answers 402: the plan's checks or free sends are used up.
 */
export function showUpgrade(message?: string): void {
  window.dispatchEvent(new CustomEvent(UPGRADE_EVENT, { detail: message ?? '' }));
}

export function onUpgrade(listener: (message: string) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<string>).detail);
  window.addEventListener(UPGRADE_EVENT, handler);
  return () => window.removeEventListener(UPGRADE_EVENT, handler);
}

/** True when an error is the API's "plan limit reached" (402). */
export function isLimitError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 402;
}

/** Tells the sidebar meter to reload after something used a check or paid. */
export function billingChanged(): void {
  window.dispatchEvent(new Event('lex:billing-changed'));
}

export function onBillingChanged(listener: () => void): () => void {
  window.addEventListener('lex:billing-changed', listener);
  return () => window.removeEventListener('lex:billing-changed', listener);
}
