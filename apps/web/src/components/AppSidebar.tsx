'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, CreditCard, FolderOpen, House, LogOut, Menu, PanelLeft, Plus, Scale, Users, X } from 'lucide-react';
import { ThemeToggle } from '@lex/theme';
import { currentUser, logout } from '@/lib/auth';
import { recentChats } from '@/lib/demo';
import { UsageMeter } from './billing/UsageMeter';
import { Wordmark } from './Brand';
import { LogoMark } from './Icons';


const NAV = [
  { href: '/', label: 'Bosh sahifa', Icon: House, badge: 0, match: (p: string) => p === '/' },
  { href: '/ask', label: 'Yuridik maslahat', Icon: Scale, badge: 0, match: (p: string) => p === '/ask' },
  {
    href: '/contracts',
    label: 'Hujjatlar',
    Icon: FolderOpen,
    badge: 0,
    match: (p: string) => p === '/contracts' || p === '/review',
  },
  {
    href: '/billing',
    label: 'Tarif',
    Icon: CreditCard,
    badge: 0,
    match: (p: string) => p === '/billing' || p === '/pricing',
  },
  { href: '/team', label: 'Jamoa', Icon: Users, badge: 0, match: (p: string) => p === '/team' },
];

function initials(name: string | undefined) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/** "New chat": a new ?n= value remounts the chat, unless an empty one is open. */
function useNewChat() {
  const pathname = usePathname();
  const router = useRouter();
  return () => {
    const fresh = pathname === '/ask' ? document.querySelector<HTMLElement>('[data-new-chat]') : null;
    if (fresh) {
      fresh.querySelector('textarea')?.focus();
      return;
    }
    router.push(`/ask?n=${Date.now()}`);
  };
}

/**
 * Left panel (Claude-like structure, own look): new chat, sections, recent chats,
 * and the signed-in user with a logout menu. Collapses to an icon rail.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const newChat = useNewChat();
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <aside className="hidden w-[68px] shrink-0 flex-col items-center gap-2 py-4 md:flex">
        <button onClick={() => setOpen(true)} className="mb-2" aria-label="Panelni ochiş" title="Panelni ochiş">
          <LogoMark className="h-9 w-12" />
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
      <SidebarPanel onCollapse={() => setOpen(false)} />
    </aside>
  );
}

/**
 * The panel itself, shared by the desktop sidebar and the small-screen drawer.
 * `onCollapse` renders the collapse button, `onNavigate` closes the drawer.
 */
function SidebarPanel({
  onCollapse,
  onNavigate,
  solid = false,
}: {
  onCollapse?: () => void;
  onNavigate?: () => void;
  /** The drawer floats over the page, so it has to be opaque; the rail can tint. */
  solid?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const newChat = useNewChat();
  const activeQ = pathname === '/ask' ? params.get('q') : null;

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col rounded-[1.4rem] shadow-[0_8px_30px_var(--shadow)] ring-1 ring-edge ${
        solid ? 'bg-surface' : 'bg-surface/60 backdrop-blur-xl'
      }`}
    >
      <div className="flex items-center justify-between pt-4 pr-2 pb-6 pl-4">
        <Link href="/" aria-label="Cralex" onClick={onNavigate}>
          <Wordmark small />
        </Link>
        <div className="flex items-center">
          <ThemeToggle className="!size-7" />
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="grid size-7 cursor-pointer place-items-center rounded-lg text-ink/55 transition hover:bg-subtle hover:text-ink"
              aria-label="Panelni yopiş"
              title="Panelni yopiş"
            >
              <PanelLeft className="size-[18px]" />
            </button>
          )}
          {onNavigate && (
            <button
              onClick={onNavigate}
              className="grid size-9 cursor-pointer place-items-center rounded-lg text-ink/55 transition hover:bg-subtle hover:text-ink"
              aria-label="Menyuni yopiş"
            >
              <X className="size-[18px]" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        <button
          onClick={() => {
            onNavigate?.();
            newChat();
          }}
          className="group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-[15px] font-medium text-ink transition hover:bg-accent-soft active:scale-[0.98]"
        >
          <span className="-ml-0.5 grid size-[22px] place-items-center rounded-full bg-accent text-on-color transition group-hover:bg-accent-hover">
            <Plus className="size-3.5" strokeWidth={2.5} />
          </span>
          <span className="flex-1">Yangi suhbat</span>
        </button>
        <div className="mx-2.5 my-1 border-t border-edge" />
        {NAV.map(({ href, label, Icon, badge, match }) => {
          const active = match(pathname) && !(href === '/ask' && activeQ);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[15px] transition md:py-1.5 ${
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
                href={`/ask?q=${encodeURIComponent(c.q)}`}
                onClick={onNavigate}
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
        <UsageMeter />
        <UserMenu />
      </div>
    </div>
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

/**
 * Small screens: a slim top bar with a menu button. The nav does not fit across
 * a phone, so it lives in a drawer holding the same panel as the sidebar.
 */
export function MobileBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape closes it; a page change (Link in the drawer) closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  const current = NAV.find((n) => n.match(pathname));

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menyu"
          aria-expanded={open}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-ink/70 transition hover:bg-surface/70 hover:text-ink"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/" aria-label="Cralex" className="shrink-0">
          <LogoMark className="h-8 w-11" />
        </Link>
        {current && <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{current.label}</span>}
        <ThemeToggle className="ml-auto shrink-0" />
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Menyuni yopiş"
            onClick={() => setOpen(false)}
            className="animate-fade-in absolute inset-0 bg-overlay backdrop-blur-[2px]"
          />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] p-2">
            <SidebarPanel solid onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
