/**
 * Hint cookie set by this app after sign-in, so `proxy.ts` can send signed-out
 * visitors to /login before a protected page renders. It holds no secret and
 * grants nothing: the API checks the access token on every call, and
 * SessionGate clears this cookie when /auth/refresh fails.
 */
export const SIGNED_IN_COOKIE = 'signed_in';

/** Stand-in origin for parsing `next`; `.invalid` never resolves. */
const PARSE_ORIGIN = 'http://next.invalid';

/**
 * Where to go after sign-in: `next` if it is a path on this site, else `/`,
 * so a crafted login link can't send the user off-site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) {
    return '/';
  }
  let url: URL;
  try {
    url = new URL(next, PARSE_ORIGIN);
  } catch {
    return '/';
  }
  // `/..//evil.com` parses on this origin but its path comes out as
  // `//evil.com`, which is another host once we navigate to it.
  if (url.origin !== PARSE_ORIGIN || url.pathname.startsWith('//')) {
    return '/';
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
