import { Suspense } from 'react';
import { SigningFlow } from '@/components/SigningFlow';

async function SigningRequest({ params }: PageProps<'/sign/[token]'>) {
  const { token } = await params;
  // TODO: load the contract + summary from lex-api with this token (GET /sign/:token/summary).
  return <SigningFlow token={token} />;
}

export default function SignPage(props: PageProps<'/sign/[token]'>) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <span className="size-6 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
        </div>
      }
    >
      <SigningRequest {...props} />
    </Suspense>
  );
}
