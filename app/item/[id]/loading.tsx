/**
 * /item/[id] loading skeleton — Phase 8 §LOADING STATES
 * Mirrors item page: image, title, metadata, action button.
 */
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';

export default function ItemLoading() {
  return (
    <div className="min-h-dvh bg-brand-bg">
      {/* Image */}
      <SkeletonBlock className="w-full aspect-square rounded-none" />

      <div className="px-5 pt-5 pb-10 flex flex-col gap-4">
        {/* Title + district */}
        <div className="flex flex-col gap-2">
          <SkeletonLine width="w-2/3" height="h-6" />
          <SkeletonLine width="w-1/3" height="h-4" />
        </div>

        {/* Credit value chip */}
        <SkeletonBlock className="w-28 h-9 rounded-full" />

        {/* Description lines */}
        <div className="flex flex-col gap-2 pt-2">
          <SkeletonLine width="w-full" height="h-3.5" />
          <SkeletonLine width="w-full" height="h-3.5" />
          <SkeletonLine width="w-3/4" height="h-3.5" />
        </div>

        {/* Action button */}
        <SkeletonBlock className="w-full h-14 mt-2" />
      </div>
    </div>
  );
}
