/**
 * /home loading skeleton — Phase 8 §LOADING STATES
 * Mirrors the home page grid: top bar + 2-column item grid.
 */
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';

export default function HomeLoading() {
  return (
    <div className="min-h-dvh bg-brand-bg px-4 pb-28">
      {/* Top bar */}
      <div
        className="flex items-center justify-between py-4"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))' }}
      >
        <SkeletonLine width="w-24" height="h-5" />
        <SkeletonBlock className="w-8 h-8 rounded-full" />
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 mb-5 overflow-hidden">
        {[80, 64, 72, 56, 68].map((w, i) => (
          <SkeletonBlock key={i} className="h-8 rounded-full shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <SkeletonBlock className="w-full aspect-[3/4] rounded-2xl" />
            <SkeletonLine width="w-3/4" height="h-3" className="mx-1" />
            <SkeletonLine width="w-1/2" height="h-3" className="mx-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
