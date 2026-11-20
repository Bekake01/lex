'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, Lock, Mail } from 'lucide-react';
import { login } from '@/lib/auth';
import { safeNextPath } from '@/lib/signed-in';

const labelClass = 'block text-sm leading-none font-medium text-ink/80';
const inputClass =
  'peer h-12 w-full min-w-0 rounded-xl border border-line bg-page/70 py-1 text-[15px] outline-none transition placeholder:text-faint hover:border-line-strong focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-4 focus-visible:ring-accent/10';
const iconClass =
  'pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted transition-colors peer-focus-visible:text-accent';

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
    <form method="post" onSubmit={handleLogin} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="flex animate-fade-up items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger-line"
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
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            autoFocus
            placeholder="siz@misol.uz"
            className={`${inputClass} pr-4 pl-12`}
          />
          <Mail className={iconClass} aria-hidden />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className={labelClass}>
          Parol
        </label>
        <div className="relative">
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
          <Lock className={iconClass} aria-hidden />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? 'Parolni yaşiriş' : 'Parolni körsatiş'}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-accent"
          >
            {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      <label
        htmlFor="remember"
        className="flex cursor-pointer items-center gap-2.5 pt-0.5 text-sm text-ink/70 select-none"
      >
        <input
          id="remember"
          name="remember"
          type="checkbox"
          className="size-[18px] cursor-pointer rounded border-line-strong accent-accent"
        />
        Meni eslab qol
      </label>

      <button
        type="submit"
        disabled={pending}
        className="group btn btn-primary btn-lg w-full"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Kirilmoqda…
          </>
        ) : (
          <>
            Kiriş <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </>
        )}
      </button>

    </form>
  );
}
