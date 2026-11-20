'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { currentUser, logout } from '@/lib/auth';

/** Top bar of the signed-in pages: who is signed in, and logout. */
export function AppHeader() {
  // Rendered inside SessionGate, so the user is known by now.
  const user = currentUser();
  const [pending, setPending] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <span className="text-xl font-bold tracking-tight">
        Lex<span className="text-brand">.</span>
      </span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {user?.fullName}{' '}
          <span className="hidden sm:inline">({user?.email})</span>
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            // SessionGate sends the tab to /login once the session ends.
            void logout();
          }}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:border-brand hover:text-brand disabled:opacity-70"
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </button>
      </div>
    </header>
  );
}
