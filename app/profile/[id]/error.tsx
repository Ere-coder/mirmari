/**
 * /profile/[id] error boundary — Phase 8 §ERROR STATES
 */
'use client';

import Link from 'next/link';

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-dvh bg-brand-bg flex flex-col items-center justify-center px-8 text-center">
      <p className="text-[16px] font-semibold text-brand-dark mb-2">Couldn&apos;t load profile</p>
      <p className="text-[13px] text-brand-dark/45 mb-6 leading-relaxed">
        Check your connection and try again.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-[240px]">
        <button
          type="button"
          onClick={reset}
          className="
            w-full bg-brand-dark text-brand-bg
            rounded-2xl py-3.5
            text-[14px] font-semibold
            active:opacity-75 transition-opacity
          "
        >
          Retry
        </button>
        <Link
          href="/home"
          className="text-[13px] text-brand-dark/45 active:text-brand-dark/70 transition-colors"
        >
          Back to browse
        </Link>
      </div>
    </div>
  );
}
