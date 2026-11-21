import { NextResponse, type NextRequest } from 'next/server';
import { SIGNED_IN_COOKIE, safeNextPath } from '@/lib/signed-in';

/**
 * Pages anyone can open (with their subpaths). Everything else needs sign-in,
 * so a new page is protected unless it is added here.
 */
const PUBLIC_PATHS = ['/login', '/register', '/invite'];

/** Public pages a signed-in user has no reason to see. */
const SIGNED_OUT_ONLY_PATHS = ['/login', '/register'];

/**
 * Sign-in redirects. Optimistic only: reads the `signed_in` hint cookie and
 * never calls the API. The real check is SessionGate in the signed-in layout
 * (/auth/refresh), and the API checks the token on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const signedIn = request.cookies.get(SIGNED_IN_COOKIE)?.value === '1';

  if (matches(pathname, PUBLIC_PATHS)) {
    if (signedIn && matches(pathname, SIGNED_OUT_ONLY_PATHS)) {
      const next = safeNextPath(searchParams.get('next'));
      // ?next=/login would bounce back here forever.
      const target = matches(next.split(/[?#]/)[0], SIGNED_OUT_ONLY_PATHS)
        ? '/'
        : next;
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
  }

  if (!signedIn) {
    const login = new URL('/login', request.url);
    // Back to this page after sign-in.
    if (pathname !== '/') {
      login.searchParams.set('next', pathname + search);
    }
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

function matches(pathname: string, paths: string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export const config = {
  // Everything except the API pass-through, Next's build files and static assets (public/).
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpe?g|gif|svg|webp|ico|txt|xml)$).*)',
  ],
};
