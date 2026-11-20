import type { Metadata } from 'next';
import { ChevronRight, MessageCircle, PenLine, ScanSearch } from 'lucide-react';
import { Wordmark } from '@/components/Brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Kiriş · Lex',
};

const STEPS = [
  { label: 'Sörang', Icon: MessageCircle, tone: 'bg-accent-soft text-accent' },
  { label: 'Tekşiring', Icon: ScanSearch, tone: 'bg-violet/20 text-[#6c47ff]' },
  { label: 'Imzolang', Icon: PenLine, tone: 'bg-coral/15 text-coral' },
];

const FACTS = [
  { value: '54 000+', label: 'qonun moddasi bazada' },
  { value: 'Manbali', label: 'har bir javob qonunga asoslanadi' },
  { value: '1 bosişda', label: 'xavfsiz elektron imzo' },
];

// The form (login-form.tsx) is a client component; the rest renders on the server.
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col">
      <header className="flex h-[72px] items-center px-4 sm:px-8">
        <Wordmark />
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-12 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Hero */}
        <section className="hidden lg:block lg:pl-6">
          {/* Three steps as one pill */}
          <div className="inline-flex items-center gap-1 rounded-full bg-white/75 p-1.5 pr-4 shadow-[0_6px_20px_rgb(0_31_41/0.06)] ring-1 ring-white backdrop-blur">
            {STEPS.map(({ label, Icon, tone }, i) => (
              <span key={label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="mx-0.5 size-3.5 text-ink/25" aria-hidden />}
                <span className="flex items-center gap-2 rounded-full py-1 pr-1.5 pl-1 text-sm font-medium text-ink">
                  <span className={`grid size-7 place-items-center rounded-full ${tone}`}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  {label}
                </span>
              </span>
            ))}
          </div>

          <h1 className="mt-7 max-w-xl text-[3.4rem] leading-[1.07] font-medium tracking-tight text-ink">
            Şartnomalar va yuridik savollar uçun AI yordamçi
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/70">
            Şartnomangizni rasmiy qonunlar asosida tekşiring, xavflarni tuşuning va xavfsiz imzolang — yoki istalgan
            huquqiy savolingizni bering.
          </p>

          {/* Short facts */}
          <dl className="mt-10 grid max-w-xl grid-cols-3 divide-x divide-ink/10 rounded-2xl bg-white/60 py-4 ring-1 ring-white backdrop-blur">
            {FACTS.map((f) => (
              <div key={f.value} className="px-5">
                <dt className="font-display text-2xl font-medium tracking-tight text-ink">{f.value}</dt>
                <dd className="mt-1 text-sm leading-snug text-muted">{f.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Form card with halo */}
        <section className="halo mx-auto w-full max-w-[26rem]">
          <div className="rounded-[1.15rem] bg-white px-7 pt-8 pb-7 sm:px-9">
            <h2 className="text-[1.75rem] leading-tight font-medium tracking-tight">Xuş kelibsiz</h2>
            <p className="mt-1.5 mb-7 text-[15px] text-muted-foreground">Davom etiş uçun hisobingizga kiring.</p>
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
