import { Suspense } from 'react';
import { apiGet } from '@/lib/api';

async function BackendStatus() {
  const message = await apiGet('/').catch(() => null);

  if (message === null) {
    return (
      <p className="text-red-600">
        Could not reach lex-api. Is the backend running?
      </p>
    );
  }
  return <p className="text-green-600">Backend says: {message}</p>;
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16">
      <h1 className="text-3xl font-semibold">Lex</h1>
      <Suspense fallback={<p className="text-zinc-500">Checking backend…</p>}>
        <BackendStatus />
      </Suspense>
    </main>
  );
}
