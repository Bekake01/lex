'use client';

import { ArrowRight, FilePenLine, MessageCircleQuestionMark, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/auth';

// One colour per job, so the three are told apart at a glance. Class names are
// spelled out in full so Tailwind keeps them.
const TONES = {
  ask: { tile: 'bg-accent-soft text-accent', card: 'hover:border-accent/50', cta: 'text-accent' },
  review: { tile: 'bg-success-soft text-success', card: 'hover:border-success/50', cta: 'text-success' },
  send: { tile: 'bg-violet-soft text-violet', card: 'hover:border-violet/50', cta: 'text-violet' },
} as const;

/**
 * Home: the three things Cralex does, each a link to its page — ask a legal
 * question (/ask), check a contract (Hujjatlar → Mening hujjatlarim), send for
 * signature (Hujjatlar → Imzolaş).
 */
export function HomeActions() {
  const firstName = currentUser()?.fullName?.split(/\s+/)[0];

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
        {firstName ? `Assalomu alaykum, ${firstName}!` : 'Assalomu alaykum!'}
      </h1>
      <p className="mt-2 text-lg text-muted">Bugun nima bilan yordam beray?</p>

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        <Card
          tone="ask"
          href="/ask"
          icon={<MessageCircleQuestionMark className="size-6" />}
          title="Yuridik savol bering"
          text="Vaziyatingizni öz sözlaringiz bilan yozing — qonunga asoslangan javob va nima qiliş kerakligini aytib beramiz."
          cta="Savol beriş"
        />
        <Card
          tone="review"
          href="/contracts?view=files"
          icon={<ShieldCheck className="size-6" />}
          title="Şartnomani tekşiring"
          text="Imzolaşdan oldin nimaga rozi bölayotganingizni biling: AI xavfli bandlarni topib, oddiy tilda tuşuntiradi."
          cta="Tekşiriş"
        />
        <Card
          tone="send"
          href="/contracts"
          icon={<FilePenLine className="size-6" />}
          title="Imzoga yuboring"
          text="Hujjatni yuklang, imzo joylarini belgilang va yuboring — kim imzolaganini kuzatib turasiz."
          cta="Yuboriş"
        />
      </div>
    </div>
  );
}

function Card({
  tone,
  href,
  icon,
  title,
  text,
  cta,
}: {
  tone: keyof typeof TONES;
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
  cta: string;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col rounded-3xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_var(--shadow)] ${t.card}`}
    >
      <span className={`grid size-12 place-items-center rounded-2xl ${t.tile}`}>{icon}</span>
      <span className="mt-5 block text-lg font-medium text-ink">{title}</span>
      <span className="mt-2 block text-[15px] leading-relaxed text-muted">{text}</span>
      <span className={`mt-auto flex items-center gap-1.5 pt-6 text-sm font-medium ${t.cta}`}>
        {cta}
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
