/**
 * /chat/[chatId] loading skeleton — Phase 8 §LOADING STATES
 * Mirrors the full-screen chat: fixed header + message bubbles.
 */
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';

export default function ChatLoading() {
  return (
    <div
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 border-b border-brand-dark/[0.06] pb-3"
        style={{ paddingTop: 'calc(0.75rem + var(--sat, 0px))' }}
      >
        <SkeletonLine width="w-12" height="h-4" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <SkeletonLine width="w-1/2" height="h-4" />
          <SkeletonLine width="w-1/4" height="h-3" />
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-hidden px-4 pt-5 flex flex-col gap-3">
        {/* Alternating left/right message bubbles */}
        {[false, true, false, false, true, false, true].map((isRight, i) => (
          <div
            key={i}
            className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}
          >
            <SkeletonBlock
              className="h-10 rounded-2xl"
              style={{ width: `${45 + (i % 3) * 15}%` }}
            />
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-4 pt-2"
        style={{ paddingBottom: 'calc(1rem + var(--sab, 0px))' }}
      >
        <SkeletonBlock className="w-full h-12 rounded-2xl" />
      </div>
    </div>
  );
}
