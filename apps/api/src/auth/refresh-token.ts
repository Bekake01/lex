import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Refresh tokens are "<session id>.<secret>": the session row is found by id
 * and the secret compared by hash, so a token from an earlier rotation is
 * recognized as reuse. Only the hash is stored.
 */

// "<uuid>.<32 bytes as base64url>". Checked before the DB sees the id, so a
// garbage token is a 401 and not a Postgres "invalid uuid" error.
const REFRESH_TOKEN_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

export interface ParsedRefreshToken {
  sessionId: string;
  secret: string;
}

/** 32 random bytes: too much entropy to guess, so a fast hash is enough. */
export function newRefreshSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 (hex) of a refresh secret: the value stored in the sessions table. */
export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function formatRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

/** Null for anything that is not a well-formed token. */
export function parseRefreshToken(token: string): ParsedRefreshToken | null {
  const match = REFRESH_TOKEN_PATTERN.exec(token);
  return match ? { sessionId: match[1], secret: match[2] } : null;
}

/** Constant-time comparison of two hex hashes. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface RefreshTokenState {
  /** Hash of the secret the client presented. */
  presentedHash: string;
  tokenHash: string;
  previousTokenHash: string | null;
  rotatedAt: Date | null;
}

/**
 * - `current`: the newest token; rotate it.
 * - `grace`: the token just rotated out, within the grace period (parallel
 *   requests, or a response the client never got).
 * - `reuse`: any other token for this session: one of its copies was stolen;
 *   revoke the session.
 */
export type RefreshTokenMatch = 'current' | 'grace' | 'reuse';

export function matchRefreshToken(
  state: RefreshTokenState,
  now: Date,
  graceMs: number,
): RefreshTokenMatch {
  if (sameHash(state.presentedHash, state.tokenHash)) {
    return 'current';
  }
  const inGrace =
    state.previousTokenHash !== null &&
    state.rotatedAt !== null &&
    sameHash(state.presentedHash, state.previousTokenHash) &&
    now.getTime() - state.rotatedAt.getTime() < graceMs;
  return inGrace ? 'grace' : 'reuse';
}
