'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { InvitePreviewWire } from '@lex/contracts';
import { AuthCard, FormError, inputClass, labelClass } from '@/components/billing/AuthCard';
import { acceptInvite } from '@/lib/auth';
import { previewInvite } from '@/lib/billing';

/**
 * The link from a team invite. An existing account confirms its password; a
 * new person picks a name and password. Either way they land signed in.
 */
export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePreviewWire | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    previewInvite(token)
      .then(setInvite)
      .catch(() => setInvalid(true));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await acceptInvite(token, {
      password: String(form.get('password') ?? ''),
      fullName: invite?.existingAccount ? undefined : String(form.get('fullName') ?? '').trim(),
    });
    if (result.ok) {
      router.replace('/team');
      return;
    }
    setPending(false);
    setError(result.message);
  }

  if (invalid) {
    return (
      <AuthCard title="Havola eskirgan" subtitle="Bu taklif havolasi işlatilgan, bekor qilingan yoki muddati ötgan.">
        <p className="text-sm text-ink/75">Kompaniya egasidan yangi havola sörang.</p>
        <Link href="/login" className="btn btn-secondary mt-6 w-full">
          Kiriş sahifasiga
        </Link>
      </AuthCard>
    );
  }

  if (!invite) {
    return (
      <AuthCard title="Taklif" subtitle="Yuklanmoqda…">
        <LoaderCircle className="mx-auto size-6 animate-spin text-muted" aria-hidden />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`${invite.agencyName} jamoasiga qöşiling`}
      subtitle={
        <>
          {invite.invitedBy} sizni taklif qildi. Kompaniya tarifi va umumiy AI tekşiruvlardan foydalanasiz.
        </>
      }
    >
      <form method="post" onSubmit={submit} className="space-y-5">
        <FormError message={error} />
        <div className="space-y-2">
          <span className={labelClass}>Email</span>
          <div className="flex h-12 items-center rounded-xl bg-subtle px-4 text-[15px] text-ink/80">{invite.email}</div>
        </div>
        {!invite.existingAccount && (
          <div className="space-y-2">
            <label htmlFor="fullName" className={labelClass}>
              Ism va familiya
            </label>
            <input id="fullName" name="fullName" required maxLength={200} autoComplete="name" autoFocus className={inputClass} />
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="password" className={labelClass}>
            {invite.existingAccount ? 'Hisobingiz paroli' : 'Yangi parol'}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={invite.existingAccount ? undefined : 8}
            maxLength={1024}
            autoComplete={invite.existingAccount ? 'current-password' : 'new-password'}
            autoFocus={invite.existingAccount}
            placeholder={invite.existingAccount ? '••••••••' : 'Kamida 8 ta belgi'}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Qöşilmoqda…' : 'Jamoaga qöşiliş'}
        </button>
      </form>
    </AuthCard>
  );
}
