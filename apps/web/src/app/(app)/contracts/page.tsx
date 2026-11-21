import { Suspense } from 'react';
import { Documents } from '@/components/Documents';

export default function DocumentsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Documents reads ?view= (useSearchParams), so it needs a Suspense boundary. */}
      <Suspense>
        <Documents />
      </Suspense>
    </div>
  );
}
