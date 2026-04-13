/**
 * BottomNav — persistent bottom navigation bar.
 *
 * Phase 6: Updated from 3 tabs to 4 tabs (Browse, Upload, Chats, Profile).
 * Added unread message badge on the Chats tab via get_unread_count() RPC.
 * Badge re-fetches on pathname change so it stays current as the user navigates.
 *
 * Shown on /home, /upload, /chats, /chat/*, /profile/*.
 * Uses usePathname() to highlight the active tab.
 * Position: fixed, centered, max-width 480px to match the app shell.
 * Respects safe-area-inset-bottom (--sab CSS var) for the home indicator.
 *
 * Spec §NAVIGATION:
 *   Browse  → /home     (active: pathname === '/home')
 *   Upload  → /upload   (active: pathname === '/upload')
 *   Chats   → /chats    (active: pathname.startsWith('/chat'))
 *   Profile → /profile  (active: pathname.startsWith('/profile'))
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ── SVG icons ─────────────────────────────────────────────────────────────────

function BrowseIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function UploadIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function ChatsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
    </svg>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────
// isActive function lets tabs with sub-routes (e.g. /chat/[id]) highlight correctly.

const TABS = [
  {
    href:     '/home',
    label:    'Browse',
    Icon:     BrowseIcon,
    isActive: (p: string) => p === '/home',
    showBadge: false,
  },
  {
    href:     '/upload',
    label:    'Upload',
    Icon:     UploadIcon,
    isActive: (p: string) => p === '/upload',
    showBadge: false,
  },
  {
    href:     '/chats',
    label:    'Chats',
    Icon:     ChatsIcon,
    isActive: (p: string) => p.startsWith('/chat'),
    showBadge: true,   // unread badge rendered for this tab
  },
  {
    href:     '/profile',
    label:    'Profile',
    Icon:     ProfileIcon,
    isActive: (p: string) => p.startsWith('/profile'),
    showBadge: false,
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname = usePathname();
  // unread count returned by get_unread_count() RPC; null = not yet loaded.
  const [unread, setUnread] = useState<number>(0);

  // ── Fetch unread count on mount and whenever the route changes ────────────
  // Runs in useEffect so the Supabase client is never called during SSR.
  useEffect(() => {
    async function fetchUnread() {
      const supabase = createClient();
      const { data } = await supabase.rpc('get_unread_count');
      setUnread((data as number) ?? 0);
    }
    fetchUnread();
  }, [pathname]);   // re-fetch when user navigates (e.g. reads a chat → count drops)

  return (
    <nav
      className="
        fixed bottom-0
        left-1/2 -translate-x-1/2
        w-full max-w-app
        bg-brand-bg
        flex items-stretch justify-around
        z-50
      "
      // [ADDED: UI structure improvement] Soft upward shadow instead of a hard
      // border-t line — lifts the nav off the content without a visual divider.
      style={{
        paddingBottom: 'calc(0.875rem + var(--sab, 0px))',
        boxShadow: '0 -1px 0 rgba(30,20,32,0.06), 0 -12px 32px rgba(30,20,32,0.05)',
      }}
      aria-label="Main navigation"
    >
      {TABS.map(({ href, label, Icon, isActive, showBadge }) => {
        const active = isActive(pathname);
        const badgeCount = showBadge ? unread : 0;

        return (
          <Link
            key={href}
            href={href}
            className={`
              relative flex flex-col items-center justify-center gap-1.5
              flex-1 pt-3
              transition-colors duration-150 select-none
              ${active ? 'text-brand-accent' : 'text-brand-dark/35'}
            `}
            aria-current={active ? 'page' : undefined}
          >
            {/*
              [ADDED: UI structure improvement] Thin accent bar at the top of
              the active tab — signals position without competing with the icon.
            */}
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[2.5px] rounded-full bg-brand-accent" />
            )}

            {/* Icon wrapper — position:relative so the badge anchors to it */}
            <span className="relative">
              <Icon active={active} />

              {/* Unread badge — shown only for the Chats tab when count > 0 */}
              {badgeCount > 0 && (
                <span
                  className="
                    absolute -top-1 -right-1.5
                    min-w-[16px] h-4
                    px-[3px]
                    rounded-full
                    bg-brand-accent
                    text-white text-[10px] font-semibold leading-4
                    flex items-center justify-center
                  "
                  aria-label={`${badgeCount} unread message${badgeCount === 1 ? '' : 's'}`}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </span>

            <span
              className={`
                text-[10px] font-medium tracking-wide
                ${active ? 'opacity-100' : 'opacity-70'}
              `}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
