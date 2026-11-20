import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in · Lex',
};

// The form (login-form.tsx) is a client component; the rest renders on the server.
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-background p-6">
      <div className="w-full max-w-[26rem] rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
        <div className="mb-8 text-center">
          <p className="mb-6 text-2xl font-bold tracking-tight">
            Lex<span className="text-brand">.</span>
          </p>
          <h1 className="mb-2 text-[1.75rem] font-extrabold tracking-tight">
            Welcome back
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Sign in to your Lex account.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
