import { AppHeader } from '@/components/app-header';
import { SessionGate } from '@/components/session-gate';

/**
 * Every signed-in page. It renders once SessionGate has confirmed the session.
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SessionGate>
      <AppHeader />
      {children}
    </SessionGate>
  );
}
