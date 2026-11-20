import { Suspense } from 'react';
import { AskChatRoute } from '@/components/ask/AskChat';

export default function AskPage() {
  // AskChat reads ?q= (useSearchParams), so it needs a Suspense boundary with cacheComponents.
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <AskChatRoute />
    </Suspense>
  );
}
