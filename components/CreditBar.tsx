/**
 * CreditBar — fixed overlay badge showing the user's current credit balance.
 *
 * Positioned in the top-left of the 480px app column, above the SwipeBrowser
 * (z-30) but below BottomNav (z-50). Tapping navigates to /credits.
 *
 * Spec §CREDIT SYSTEM: "always-visible balance indicator on /home".
 */
'use client';

import Link from 'next/link';

interface Props {
  balance: number;
}

export default function CreditBar({ balance }: Props) {
  return (
    <div
      className="fixed z-30 pointer-events-none"
      style={{
        // Align to top-left of the 480px app column
        top: 'calc(1rem + var(--sat, 0px))',
        left: 'max(1rem, calc(50% - 240px + 1rem))',
      }}
    >
      <Link
        href="/credits"
        className="
          pointer-events-auto
          inline-flex items-center
          px-3.5 py-2
          rounded-full
          bg-brand-dark/70 backdrop-blur-sm
          text-brand-bg text-[13px] font-semibold
          active:opacity-75 transition-opacity
        "
      >
        {balance} credits
      </Link>
    </div>
  );
}
