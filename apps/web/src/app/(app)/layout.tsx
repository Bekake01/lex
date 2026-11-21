import { Suspense } from 'react';
import { AppSidebar, MobileBar } from '@/components/AppSidebar';
import { SessionGate } from '@/components/session-gate';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';

/**
 * Every signed-in page. It renders once SessionGate has confirmed the session.
 * Left panel (sections, recent chats, user + logout), page on the right.
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SessionGate>
      <div className="flex h-dvh overflow-hidden">
        {/* The sidebar reads ?q= (useSearchParams), so it needs a Suspense boundary. */}
        <Suspense fallback={<div className="hidden w-[272px] shrink-0 md:block" />}>
          <AppSidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileBar />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
      </div>
      <UpgradeDialog />
    </SessionGate>
  );
}
