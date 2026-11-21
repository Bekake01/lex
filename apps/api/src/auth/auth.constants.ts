const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Idle expiry moves forward on each refresh; absolute expiry never does.
export const SESSION_IDLE_MS_REMEMBERED = 7 * DAY;
// Without "remember me" (shared computers).
export const SESSION_IDLE_MS_NOT_REMEMBERED = 12 * HOUR;
export const SESSION_ABSOLUTE_MS = 30 * DAY;

// How long the token just rotated out still works, so parallel tabs refreshing
// at once aren't logged out. It gets only a new access token, no new cookie.
export const REFRESH_GRACE_MS = 60 * 1000;

export const REFRESH_COOKIE_NAME = 'refresh_token';
// The browser sends the cookie only to the auth endpoints, never to the rest of the API.
export const REFRESH_COOKIE_PATH = '/auth';

// RFC 5321 limit on an address.
export const EMAIL_MAX_LENGTH = 320;
// argon2 runs on the whole password, so a huge one would be a cheap way to burn CPU.
export const PASSWORD_MAX_LENGTH = 1024;

/** Shortest password accepted at sign-up or when joining by invite. */
export const PASSWORD_MIN_LENGTH = 8;
