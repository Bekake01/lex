import { Suspense } from 'react';
import { SigningFlow } from '@/components/sign/SigningFlow';
import { Loading } from '@/components/sign/States';

async function SigningRequest({ params }: PageProps<'/sign/[token]'>) {
  const { token } = await params;
  return <SigningFlow token={token} />;
}

export default function SignPage(props: PageProps<'/sign/[token]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <SigningRequest {...props} />
    </Suspense>
  );
}
