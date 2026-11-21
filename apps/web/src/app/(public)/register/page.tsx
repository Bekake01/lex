'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { AuthCard, FormError, inputClass, labelClass } from '@/components/billing/AuthCard';
import { DEMO_LOGIN, login, register } from '@/lib/auth';

/** Sign-up: a free account with 3 AI checks, signed in right away. */
export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      fullName: String(form.get('fullName') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
    };
    if (input.password.length < 8) {
      setError('Parol kamida 8 ta belgidan iborat bölsin.');
      return;
    }
    setError(null);
    setPending(true);
    const result = DEMO_LOGIN
      ? await login({ email: input.email, password: input.password, rememberMe: true })
      : await register(input);
    if (result.ok) {
      router.replace('/');
      return;
    }
    setPending(false);
    setError(result.message);
  }

  return (
    <AuthCard title="Röyxatdan ötiş" subtitle="3 ta AI tekşiruv bepul. Karta kerak emas.">
      <form method="post" onSubmit={submit} className="space-y-5">
        <FormError message={error} />
        <div className="space-y-2">
          <label htmlFor="fullName" className={labelClass}>
            Ism va familiya
          </label>
          <input id="fullName" name="fullName" required maxLength={200} autoComplete="name" autoFocus className={inputClass} />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            placeholder="siz@misol.uz"
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className={labelClass}>
            Parol
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={1024}
            autoComplete="new-password"
            placeholder="Kamida 8 ta belgi"
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Yaratilmoqda…
            </>
          ) : (
            'Hisob yaratiş'
          )}
        </button>
        <p className="text-center text-sm text-muted">
          Hisobingiz bormi?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Kiriş
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
