import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The password ticket. After `POST /sign/:token/unlock` the signer holds
 * `<exp>.<hmac>` (HMAC-SHA256 of `token.exp`), sent back as `x-sign-ticket`
 * on every later call. Bound to the one token, valid for 2 hours, nothing
 * stored server-side.
 */
const TTL_MS = 2 * 60 * 60 * 1000;

function mac(secret: string, token: string, exp: number): Buffer {
  return createHmac('sha256', secret).update(`${token}.${exp}`).digest();
}

export function issueTicket(
  secret: string,
  token: string,
  now = Date.now(),
): string {
  const exp = now + TTL_MS;
  return `${exp}.${mac(secret, token, exp).toString('base64url')}`;
}

export function verifyTicket(
  secret: string,
  token: string,
  ticket: string | undefined,
  now = Date.now(),
): boolean {
  if (!ticket) return false;
  const dot = ticket.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(ticket.slice(0, dot));
  if (!Number.isSafeInteger(exp) || exp < now) return false;
  const given = Buffer.from(ticket.slice(dot + 1), 'base64url');
  const expected = mac(secret, token, exp);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
