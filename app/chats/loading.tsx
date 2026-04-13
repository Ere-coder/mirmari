/**
 * /chats loading skeleton — Phase 8 §LOADING STATES
 * Mirrors chat list: header + rows of conversations.
 */
import { SkeletonLine, SkeletonBlock } from '@/components/Skeleton';

export default function ChatsLoading() {
  return (
    <div
      className="min-h-dvh bg-brand-bg px-5 pb-28"
      style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))' }}
    >
      {/* Page title */}
      <SkeletonLine width="w-16" height="h-6" className="mb-5" />

      {/* Chat rows */}
      <div className="flex flex-col divide-y divide-brand-dark/[0.06]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 py-4">
            {/* Avatar */}
            <SkeletonBlock className="w-11 h-11 rounded-full shrink-0" />
            {/* Text */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <SkeletonLine width="w-1/3" height="h-3.5" />
              <SkeletonLine width="w-2/3" height="h-3" />
            </div>
            {/* Timestamp */}
            <SkeletonLine width="w-10" height="h-3" className="shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
