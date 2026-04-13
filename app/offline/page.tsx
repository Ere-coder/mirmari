/**
 * Offline fallback page — served by the service worker when the user navigates
 * to an uncached route with no network connection.
 *
 * Phase 8 §PWA — must be pre-cached in sw.js PRECACHE_URLS.
 */
'use client';

export default function OfflinePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-dvh px-8 text-center">
      <div className="flex flex-col items-center gap-5 max-w-[280px]">
        {/* Simple cloud-with-slash icon using SVG */}
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-dark/20"
        >
          <path d="M17 7A5 5 0 0 0 7.1 7.6M3 15a4 4 0 0 0 4 4h9.5a3.5 3.5 0 0 0 1.4-6.7" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>

        <div className="flex flex-col gap-2">
          <p className="text-[18px] font-semibold text-brand-dark">You&apos;re offline</p>
          <p className="text-[14px] text-brand-dark/45 leading-relaxed">
            Check your connection and try again.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="
            mt-2 w-full bg-brand-dark text-brand-bg
            rounded-2xl py-4
            text-[15px] font-semibold
            active:opacity-75 transition-opacity
          "
        >
          Retry
        </button>
      </div>
    </main>
  );
}
