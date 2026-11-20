import { Suspense } from 'react';

async function SigningRequest({ params }: PageProps<'/sign/[token]'>) {
  const { token } = await params;

  // TODO: load the contract + summary from lex-api with this token, then consent → sign.
  return (
    <p className="text-zinc-500">
      Signing request <code className="font-mono">{token}</code>
    </p>
  );
}

export default function SignPage(props: PageProps<'/sign/[token]'>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16">
      <h1 className="text-3xl font-semibold">Review and sign</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <SigningRequest {...props} />
      </Suspense>
    </main>
  );
}
