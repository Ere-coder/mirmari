/**
 * /admin loading skeleton — Phase 8 §LOADING STATES
 * Mirrors admin dashboard: stats + report list rows.
 */
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';

export default function AdminLoading() {
  return (
    <div
      className="min-h-dvh bg-brand-bg px-5 pb-10"
      style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))' }}
    >
      {/* Page title */}
      <SkeletonLine width="w-28" height="h-6" className="mb-6" />

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[0, 1, 2, 3].map(i => (
          <SkeletonBlock key={i} className="h-20 rounded-2xl" />
        ))}
      </div>

      {/* Section heading */}
      <SkeletonLine width="w-32" height="h-4" className="mb-4" />

      {/* Report rows */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="w-full h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
