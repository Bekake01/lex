'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { login } from '@/lib/auth';
import { safeNextPath } from '@/lib/signed-in';

const labelClass = 'block text-[15px] leading-none font-medium';
const inputClass =
  'h-12 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 text-[15px] shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/30';

/**
 * Email and password. On success the token is in memory, `signed_in` is set,
 * and the user goes to `?next=` or `/`. No "forgot password" yet.
 */
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await login({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      rememberMe: form.get('remember') === 'on',
    });
    if (result.ok) {
      // Read at submit time rather than with useSearchParams(), which would
      // need a Suspense boundary to keep this page prerendered.
      const next = new URLSearchParams(window.location.search).get('next');
      // `pending` stays on so the button can't be pressed again while leaving.
      router.replace(safeNextPath(next));
      return;
    }
    setPending(false);
    setError(result.message);
  }

  return (
    // method="post" so that, before the JS loads, a native submit can't put
    // the password in the URL.
    <form method="post" onSubmit={handleLogin} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[15px] text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            className={`${inputClass} pr-4 pl-12`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            maxLength={1024}
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${inputClass} pr-12 pl-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-brand"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      <label
        htmlFor="remember"
        className="flex cursor-pointer items-center gap-2.5 text-[15px] text-muted-foreground select-none"
      >
        <input
          id="remember"
          name="remember"
          type="checkbox"
          className="size-[18px] cursor-pointer rounded border-input accent-brand"
        />
        Keep me signed in
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand px-2.5 text-[15px] font-bold tracking-wide text-brand-foreground shadow-lg shadow-brand/30 transition-all duration-300 outline-none select-none hover:bg-brand/90 focus-visible:ring-3 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-70"
      >
        {pending ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
