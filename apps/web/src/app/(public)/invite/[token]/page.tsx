import { Suspense } from 'react';
import { InviteForm } from './invite-form';

type Params = Promise<{ token: string }>;

/** A team invite link: `/invite/<token>`. */
export default function InvitePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <InviteFor params={params} />
    </Suspense>
  );
}

async function InviteFor({ params }: { params: Params }) {
  const { token } = await params;
  return <InviteForm token={token} />;
}
