import type React from 'react';

/**
 * Skeleton — reusable loading placeholder primitives.
 *
 * All skeletons use the brand surface colour (#F5E8EE) with Tailwind's
 * animate-pulse so they match the app's palette.
 *
 * Phase 8 §LOADING STATES
 */

/** Single rectangular skeleton block. */
export function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-brand-surface animate-pulse rounded-2xl ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Full-width text line skeleton. width controls how wide (Tailwind w-* class). */
export function SkeletonLine({
  width = 'w-full',
  height = 'h-3',
  className = '',
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`bg-brand-surface animate-pulse rounded-full ${width} ${height} ${className}`}
      aria-hidden="true"
    />
  );
}

/** Card-shaped skeleton — matches item/chat card proportions. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
      <SkeletonBlock className="w-full aspect-[4/3]" />
      <div className="flex flex-col gap-2 px-1">
        <SkeletonLine width="w-2/3" height="h-3.5" />
        <SkeletonLine width="w-1/3" height="h-3" />
      </div>
    </div>
  );
}

/** Row-shaped skeleton — matches chat list rows. */
export function SkeletonRow({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${className}`} aria-hidden="true">
      <SkeletonBlock className="w-10 h-10 rounded-full shrink-0" />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <SkeletonLine width="w-1/2" height="h-3.5" />
        <SkeletonLine width="w-3/4" height="h-3" />
      </div>
    </div>
  );
}
