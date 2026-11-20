import { Suspense } from 'react';
import { OpenLinkStart } from '@/components/sign/OpenLinkStart';
import { Loading } from '@/components/sign/States';

async function OpenLink({ params }: PageProps<'/open/[publicToken]'>) {
  const { publicToken } = await params;
  return <OpenLinkStart publicToken={publicToken} />;
}

export default function OpenLinkPage(props: PageProps<'/open/[publicToken]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <OpenLink {...props} />
    </Suspense>
  );
}
