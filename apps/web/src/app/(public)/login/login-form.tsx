'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, Lock, Mail } from 'lucide-react';
import { login } from '@/lib/auth';
import { safeNextPath } from '@/lib/signed-in';

const labelClass = 'block text-sm leading-none font-medium text-ink/80';
const inputClass =
  'peer h-12 w-full min-w-0 rounded-xl border border-line bg-cream/70 py-1 text-[15px] outline-none transition placeholder:text-slate-400 hover:border-input focus-visible:border-brand focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-brand/10';
const iconClass =
  'pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors peer-focus-visible:text-brand';

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
          className="flex animate-fade-up items-start gap-2.5 rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20"
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
            className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sand hover:text-brand"
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
          className="size-[18px] cursor-pointer rounded border-input accent-brand"
        />
        Meni eslab qol
      </label>

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#2f83f9,#0767ee_55%,#0651bc)] px-2.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgb(7_103_238/0.28),inset_0_1px_0_rgb(255_255_255/0.25)] transition-all duration-200 outline-none select-none hover:-translate-y-px hover:shadow-[0_14px_28px_rgb(7_103_238/0.34),inset_0_1px_0_rgb(255_255_255/0.25)] focus-visible:ring-4 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-75"
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
