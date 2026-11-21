import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_COOKIE_NAME } from './auth.constants.js';
import type { IssuedSession } from './session.service.js';

/** `secure` is off on http://localhost; `path` is where the browser sees the auth routes. */
export interface RefreshCookieConfig {
  secure: boolean;
  path: string;
}

function baseOptions({ secure, path }: RefreshCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    // Off on http://localhost in development, where Safari would drop it.
    secure,
    // The web app (localhost:3000) and the API (localhost:5000) are the same
    // site, so Lax is enough against CSRF here.
    sameSite: 'lax',
    path,
  };
}

export function setRefreshCookie(
  res: Response,
  session: Pick<IssuedSession, 'refreshToken' | 'rememberMe' | 'idleExpiresAt'>,
  config: RefreshCookieConfig,
): void {
  res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
    ...baseOptions(config),
    // Without "remember me" there is no expiry, so the cookie is gone when
    // the browser closes.
    ...(session.rememberMe ? { expires: session.idleExpiresAt } : {}),
  });
}

export function clearRefreshCookie(res: Response, config: RefreshCookieConfig): void {
  // The browser only drops it when name, path and flags match the original.
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(config));
}

/** Express 5 doesn't parse cookies, and this is the only one the API reads. */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (part.slice(0, separator).trim() === REFRESH_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
