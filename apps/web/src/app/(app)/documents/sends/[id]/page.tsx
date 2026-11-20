import { Suspense } from 'react';
import { SendDetail } from '@/components/send/SendDetail';

type Params = Promise<{ id: string }>;

/** One sent request: everyone's status, links and signed copies. */
export default function SendDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <SendDetailFor params={params} />
    </Suspense>
  );
}

async function SendDetailFor({ params }: { params: Params }) {
  const { id } = await params;
  return <SendDetail id={id} />;
}
