'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, FolderOpen, LogOut, PanelLeft, Plus, Scale } from 'lucide-react';
import { ThemeToggle } from '@lex/theme';
import { currentUser, logout } from '@/lib/auth';
import { contracts, recentChats } from '@/lib/demo';
import { Wordmark } from './Brand';
import { LogoMark } from './Icons';

const newCount = contracts.filter((c) => c.status === 'new').length;

const NAV = [
  { href: '/', label: 'Yuridik maslahat', Icon: Scale, badge: 0, match: (p: string) => p === '/' },
  {
    href: '/contracts',
    label: 'Hujjatlar',
    Icon: FolderOpen,
    badge: newCount,
    match: (p: string) => p === '/contracts' || p === '/review',
  },
];

function initials(name: string | undefined) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/**
 * Left panel (Claude-like structure, own look): new chat, sections, recent chats,
 * and the signed-in user with a logout menu. Collapses to an icon rail.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // A fresh chat: a new ?n= value remounts the chat on "/".
  // Already on an empty chat: don't reload it, just put the cursor in the box.
  const newChat = () => {
    const fresh = pathname === '/' ? document.querySelector<HTMLElement>('[data-new-chat]') : null;
    if (fresh) {
      fresh.querySelector('textarea')?.focus();
      return;
    }
    router.push(`/?n=${Date.now()}`);
  };
  const activeQ = pathname === '/' ? params.get('q') : null;

  if (!open) {
    return (
      <aside className="hidden w-[68px] shrink-0 flex-col items-center gap-2 py-4 md:flex">
        <button onClick={() => setOpen(true)} className="mb-2" aria-label="Panelni ochiş" title="Panelni ochiş">
          <LogoMark className="size-9" />
        </button>
        <button
          onClick={newChat}
          title="Yangi suhbat"
          aria-label="Yangi suhbat"
          className="group grid size-10 cursor-pointer place-items-center rounded-xl transition hover:bg-accent-soft"
        >
          <span className="grid size-[26px] place-items-center rounded-full bg-accent text-on-color transition group-hover:bg-accent-hover">
            <Plus className="size-4" strokeWidth={2.5} />
          </span>
        </button>
        {NAV.map(({ href, label, Icon, badge, match }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className={`relative grid size-10 place-items-center rounded-xl transition ${
              match(pathname) ? 'bg-surface text-accent shadow-sm' : 'text-ink/55 hover:bg-surface/70 hover:text-ink'
            }`}
          >
            <Icon className="size-[18px]" />
            {badge > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-coral ring-2 ring-surface" />}
          </Link>
        ))}
        <div className="mt-auto flex flex-col items-center gap-2">
          <ThemeToggle className="size-10 rounded-xl" />
          <UserMenu compact />
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[272px] shrink-0 p-3 md:flex">
      <div className="flex min-h-0 flex-1 flex-col rounded-[1.4rem] bg-surface/60 shadow-[0_8px_30px_var(--shadow)] ring-1 ring-edge backdrop-blur-xl">
        <div className="flex items-center justify-between pt-4 pr-2 pb-6 pl-4">
          <Link href="/" aria-label="Lex">
            <Wordmark small />
          </Link>
          <div className="flex items-center">
          <ThemeToggle className="!size-7" />
          <button
            onClick={() => setOpen(false)}
            className="grid size-7 cursor-pointer place-items-center rounded-lg text-ink/55 transition hover:bg-subtle hover:text-ink"
            aria-label="Panelni yopiş"
            title="Panelni yopiş"
          >
            <PanelLeft className="size-[18px]" />
          </button>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          <button
            onClick={newChat}
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-[15px] font-medium text-ink transition hover:bg-accent-soft active:scale-[0.98]"
          >
            <span className="-ml-0.5 grid size-[22px] place-items-center rounded-full bg-accent text-on-color transition group-hover:bg-accent-hover">
              <Plus className="size-3.5" strokeWidth={2.5} />
            </span>
            <span className="flex-1">Yangi suhbat</span>
          </button>
          <div className="mx-2.5 my-1 border-t border-edge" />
          {NAV.map(({ href, label, Icon, badge, match }) => {
            const active = match(pathname) && !(href === '/' && activeQ);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-[15px] transition ${
                  active ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink/70 hover:bg-surface/70 hover:text-ink'
                }`}
              >
                <Icon className={`size-[18px] ${active ? 'text-accent' : 'text-ink/45'}`} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] leading-5 font-bold text-on-color">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 px-5.5 pb-1 text-[13px] font-medium text-ink/45">
          Söngi suhbatlar
        </div>
        <ul className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-3 pb-2">
          {recentChats.map((c) => {
            const active = activeQ === c.q;
            return (
              <li key={c.id}>
                <Link
                  href={`/?q=${encodeURIComponent(c.q)}`}
                  className={`block truncate rounded-xl px-2.5 py-1.5 text-[15px] transition ${
                    active ? 'bg-surface text-ink shadow-sm' : 'text-ink/70 hover:bg-surface/70 hover:text-ink'
                  }`}
                  title={c.title}
                >
                  {c.title}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-edge p-2">
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}

/** Signed-in user + logout, opening upwards. */
function UserMenu({ compact = false }: { compact?: boolean }) {
  // Rendered inside SessionGate, so the user is known by now.
  const user = currentUser();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const avatar = (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-coral text-xs font-bold text-on-color">
      {initials(user?.fullName)}
    </span>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={compact ? 'rounded-full' : 'flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-surface/80'}
      >
        {avatar}
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user?.fullName}</span>
              <span className="block truncate text-xs text-muted">{user?.email}</span>
            </span>
            <ChevronsUpDown className="size-4 text-ink/40" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute bottom-full z-40 mb-2 w-60 animate-fade-up rounded-2xl bg-surface p-1.5 shadow-[0_16px_40px_var(--shadow)] ring-1 ring-line ${
            compact ? 'left-0' : 'right-0 left-0 w-auto'
          }`}
        >
          {compact && (
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium">{user?.fullName}</div>
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              // SessionGate sends the tab to /login once the session ends.
              void logout();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            <LogOut className="size-4" />
            Çiqiş
          </button>
        </div>
      )}
    </div>
  );
}

/** Small screens: a compact top bar instead of the sidebar. */
export function MobileBar() {
  const pathname = usePathname();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-4 md:hidden">
      <Link href="/" aria-label="Lex">
        <Wordmark small />
      </Link>
      <ThemeToggle className="ml-auto" />
      <nav className="flex rounded-full bg-surface/70 p-1 ring-1 ring-edge">
        {NAV.map(({ href, label, match }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${match(pathname) ? 'bg-ink text-page' : 'text-ink/60'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
