import type { ReactNode } from 'react';
import { ThemeToggle } from '@lex/theme';
import { Wordmark } from '@/components/Brand';

export const labelClass = 'block text-sm leading-none font-medium text-ink/80';
export const inputClass =
  'h-12 w-full min-w-0 rounded-xl border border-line bg-page/70 px-4 text-[15px] outline-none transition placeholder:text-faint hover:border-line-strong focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-4 focus-visible:ring-accent/10';

/** The login page's frame and card, for sign-up and invite pages. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col">
      <header className="flex h-[72px] items-center px-4 sm:px-8">
        <Wordmark />
        <ThemeToggle className="ml-auto" />
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-12">
        <section className="halo w-full max-w-[26rem]">
          <div className="rounded-[1.15rem] bg-surface px-7 pt-8 pb-7 sm:px-9">
            <h1 className="text-[1.75rem] leading-tight font-medium tracking-tight">{title}</h1>
            <div className="mt-1.5 mb-7 text-[15px] text-muted">{subtitle}</div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="animate-fade-up rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger-line"
    >
      {message}
    </div>
  );
}
