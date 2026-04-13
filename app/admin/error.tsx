/**
 * /admin error boundary — Phase 8 §ERROR STATES
 */
'use client';

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-dvh bg-brand-bg flex flex-col items-center justify-center px-8 text-center">
      <p className="text-[16px] font-semibold text-brand-dark mb-2">Couldn&apos;t load dashboard</p>
      <p className="text-[13px] text-brand-dark/45 mb-6 leading-relaxed">
        Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="
          bg-brand-dark text-brand-bg
          rounded-2xl px-8 py-3.5
          text-[14px] font-semibold
          active:opacity-75 transition-opacity
        "
      >
        Retry
      </button>
    </div>
  );
}
