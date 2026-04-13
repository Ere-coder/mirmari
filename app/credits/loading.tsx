/**
 * /credits loading skeleton — Phase 8 §LOADING STATES
 * Mirrors credits page: balance display + credit packages.
 */
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';

export default function CreditsLoading() {
  return (
    <div
      className="min-h-dvh bg-brand-bg px-5 pb-10"
      style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))' }}
    >
      {/* Page title */}
      <SkeletonLine width="w-20" height="h-6" className="mb-6" />

      {/* Balance card */}
      <SkeletonBlock className="w-full h-28 rounded-2xl mb-8" />

      {/* Section heading */}
      <SkeletonLine width="w-28" height="h-4" className="mb-4" />

      {/* Package cards */}
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map(i => (
          <SkeletonBlock key={i} className="w-full h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
