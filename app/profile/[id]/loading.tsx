/**
 * /profile/[id] loading skeleton — Phase 8 §LOADING STATES
 * Mirrors profile page: avatar, name, stats, item grid.
 */
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';

export default function ProfileLoading() {
  return (
    <div
      className="min-h-dvh bg-brand-bg px-5 pb-28"
      style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))' }}
    >
      {/* Back button area */}
      <SkeletonLine width="w-12" height="h-4" className="mb-6" />

      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <SkeletonBlock className="w-20 h-20 rounded-full" />
        <div className="flex flex-col items-center gap-2">
          <SkeletonLine width="w-32" height="h-5" />
          <SkeletonLine width="w-20" height="h-4" />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex justify-around mb-8">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex flex-col items-center gap-2">
            <SkeletonLine width="w-8" height="h-5" />
            <SkeletonLine width="w-14" height="h-3" />
          </div>
        ))}
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <SkeletonBlock className="w-full aspect-[3/4] rounded-2xl" />
            <SkeletonLine width="w-3/4" height="h-3" className="mx-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
