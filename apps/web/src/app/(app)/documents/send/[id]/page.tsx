import { Suspense } from 'react';
import { SendFlow } from '@/components/send/SendFlow';

type Params = Promise<{ id: string }>;

/** Send a PDF for signature: `id` is the draft (`POST /signature-requests`). */
export default function SendPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <SendFlowFor params={params} />
    </Suspense>
  );
}

async function SendFlowFor({ params }: { params: Params }) {
  const { id } = await params;
  return <SendFlow id={id} />;
}
