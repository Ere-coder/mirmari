'use client';

/**
 * BottomNav — v2 persistent bottom navigation bar.
 *
 * v2 tabs (Phase 1):
 *   Wardrobe  → /wardrobe   (active: pathname.startsWith('/wardrobe'))
 *   Schedule  → /schedule   (active: pathname.startsWith('/schedule'))
 *   Messages  → /messages   (active: pathname.startsWith('/messages'))
 *   Profile   → /profile    (active: pathname.startsWith('/profile'))
 *
 * Unread badge on Messages tab is wired in Phase 7 when the v2 messaging
 * system is built. Removed from this component for now.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ── Icons ──────────────────────────────────────────────────────────────────────

function WardrobeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      {/* Hook */}
      <circle cx="12" cy="5" r="1.5" />
      {/* Hanger body — fans out from hook to a wide base */}
      <path d="M12 6.5C9.5 8 4 11.5 4 17h16c0-5.5-5.5-9-8-10.5z" />
    </svg>
  );
}

function ScheduleIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  );
}

function MessagesIcon({ active }: { active: boolean }) {
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

const TABS = [
  {
    href:     '/wardrobe',
    label:    'Wardrobe',
    Icon:     WardrobeIcon,
    isActive: (p: string) => p.startsWith('/wardrobe'),
  },
  {
    href:     '/schedule',
    label:    'Schedule',
    Icon:     ScheduleIcon,
    isActive: (p: string) => p.startsWith('/schedule'),
  },
  {
    href:     '/messages',
    label:    'Messages',
    Icon:     MessagesIcon,
    isActive: (p: string) => p.startsWith('/messages'),
  },
  {
    href:     '/profile',
    label:    'Profile',
    Icon:     ProfileIcon,
    isActive: (p: string) => p.startsWith('/profile'),
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname = usePathname();

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
      style={{
        paddingBottom: 'calc(0.875rem + var(--sab, 0px))',
        boxShadow: '0 -1px 0 rgba(30,20,32,0.06), 0 -12px 32px rgba(30,20,32,0.05)',
      }}
      aria-label="Main navigation"
    >
      {TABS.map(({ href, label, Icon, isActive }) => {
        const active = isActive(pathname);

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
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[2.5px] rounded-full bg-brand-accent" />
            )}

            <Icon active={active} />

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
