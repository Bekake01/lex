'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CloudOff, LoaderCircle, RotateCw } from 'lucide-react';
import { ensureSession, onSignedOut, type SignOutReason } from '@/lib/auth';

type State = 'checking' | 'ready' | 'offline';

/**
 * The real sign-in check for every signed-in page (`proxy.ts` only reads a
 * hint cookie). The page renders only once /auth/refresh has given this tab
 * an access token. When the session is over, now or later, and in this tab
 * or another one, it goes to /login with a full page load, so nothing of the
 * session stays in memory.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => onSignedOut(goToLogin), []);

  useEffect(() => {
    let cancelled = false;
    ensureSession().then(
      (signedIn) => {
        if (cancelled) return;
        if (signedIn) setState('ready');
        else goToLogin('expired');
      },
      () => {
        if (!cancelled) setState('offline');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state === 'ready') {
    return children;
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      {state === 'checking' ? (
        <LoaderCircle
          className="size-6 animate-spin text-muted-foreground"
          aria-label="Loading"
        />
      ) : (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <CloudOff className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Can&apos;t reach Lex. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => {
              setState('checking');
              setAttempt((value) => value + 1);
            }}
            className="flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground"
          >
            <RotateCw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/** Back to this page after signing in again, unless the user chose to leave. */
function goToLogin(reason: SignOutReason): void {
  const here = `${window.location.pathname}${window.location.search}`;
  const keepPlace = reason === 'expired' && here !== '/';
  window.location.replace(
    keepPlace ? `/login?next=${encodeURIComponent(here)}` : '/login',
  );
}
