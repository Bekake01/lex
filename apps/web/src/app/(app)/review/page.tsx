import { Suspense } from 'react';
import { ReviewScreen, ReviewStart } from '@/components/review/ReviewScreen';

type SearchParams = Promise<{ doc?: string | string[] }>;

/** `/review?doc=<documentId>`: the AI review of an uploaded document. */
export default function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <ReviewFor searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewFor({ searchParams }: { searchParams: SearchParams }) {
  const { doc } = await searchParams;
  const documentId = Array.isArray(doc) ? doc[0] : doc;
  // key: a new version (after accepting edits) starts a fresh screen.
  return documentId ? <ReviewScreen key={documentId} documentId={documentId} /> : <ReviewStart />;
}
