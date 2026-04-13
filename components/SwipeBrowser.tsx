/**
 * SwipeBrowser — full-screen swipe-based item browse interface.
 *
 * Spec §BROWSE:
 *   Vertical swipe   up   → next item
 *   Vertical swipe   down → previous item
 *   Horizontal swipe right → enter deep images (non-forward layer: original)
 *                             continue right → gallery view of all images
 *   Horizontal swipe left  → go back through deep images
 *                             left from first deep image → return to forward image
 *
 * Overlay on forward image shows: category, primary_size, fit_description,
 * credit_value, and owner district.
 *
 * Positioning: fixed, centered, max-width 480px — matches the app shell but
 * escapes its safe-area padding so images fill the full viewport height.
 *
 * Dependencies: react-swipeable (gestures), Framer Motion (transitions).
 *
 * NOTE: The credit_value display and "borrow" action are shown as read-only here.
 * Phase 3 will attach the borrow flow (credit deduction, queue, messaging) to
 * the credit badge area — look for the "// PHASE 3: borrow action" comment below.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSwipeable } from 'react-swipeable';
import { AnimatePresence, motion } from 'framer-motion';
import { BrowseItem, CATEGORY_LABELS } from '@/lib/types';

interface Props {
  items: BrowseItem[];
}

// ── Animation variants ────────────────────────────────────────────────────────

// Vertical: used when navigating between items (swipe up/down).
const verticalVariants = {
  enter:  (dir: number) => ({ y: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit:   (dir: number) => ({ y: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

// Horizontal: used when navigating between images within an item (swipe left/right).
const horizontalVariants = {
  enter:  (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

const transition = { type: 'tween', ease: 'easeInOut', duration: 0.28 } as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function SwipeBrowser({ items }: Props) {
  // ── State ──────────────────────────────────────────────────────────────────

  // Which item is currently shown (index into the items array).
  const [itemIndex, setItemIndex] = useState(0);
  // Direction for item transition: 1 = next (swiped up), -1 = prev (swiped down).
  const [itemDir, setItemDir] = useState(0);

  // Current view mode:
  //   'forward'  — the main (is_forward=true) image with info overlay
  //   'deep'     — cycling through non-forward images
  //   'gallery'  — all images in a grid (reached by swiping past all deep images)
  const [view, setView] = useState<'forward' | 'deep' | 'gallery'>('forward');
  // Which deep image is shown (index into deepImages array).
  const [deepIndex, setDeepIndex] = useState(0);
  // Direction for image transition: 1 = right, -1 = left.
  const [imageDir, setImageDir] = useState(0);

  // ── Derived values ─────────────────────────────────────────────────────────

  const item        = items[itemIndex];
  const forwardImg  = item?.images.find(img => img.is_forward);
  const deepImages  = item?.images.filter(img => !img.is_forward) ?? [];

  // Key used by inner AnimatePresence to trigger image transitions.
  const imageKey =
    view === 'forward' ? `fwd` :
    view === 'deep'    ? `deep-${deepIndex}` :
                         'gallery';

  // ── Swipe handlers ─────────────────────────────────────────────────────────

  const handlers = useSwipeable({
    // Swipe UP → next item (resets to forward view)
    onSwipedUp() {
      if (itemIndex < items.length - 1) {
        setItemDir(1);
        setItemIndex(i => i + 1);
        setView('forward');
        setDeepIndex(0);
      }
    },

    // Swipe DOWN → previous item (resets to forward view)
    onSwipedDown() {
      if (itemIndex > 0) {
        setItemDir(-1);
        setItemIndex(i => i - 1);
        setView('forward');
        setDeepIndex(0);
      }
    },

    // Swipe RIGHT → enter deep images / advance through them / open gallery
    onSwipedRight() {
      if (view === 'forward') {
        if (deepImages.length > 0) {
          setImageDir(1);
          setView('deep');
          setDeepIndex(0);
        }
      } else if (view === 'deep') {
        if (deepIndex < deepImages.length - 1) {
          setImageDir(1);
          setDeepIndex(i => i + 1);
        } else {
          // Past the last deep image → gallery view
          setView('gallery');
        }
      }
      // Swiping right in gallery is a no-op.
    },

    // Swipe LEFT → go back through deep images / back to forward / close gallery
    onSwipedLeft() {
      if (view === 'gallery') {
        // Close gallery → back to last deep image
        setView('deep');
      } else if (view === 'deep') {
        if (deepIndex > 0) {
          setImageDir(-1);
          setDeepIndex(i => i - 1);
        } else {
          // Already at first deep image → back to forward
          setImageDir(-1);
          setView('forward');
        }
      }
      // Swiping left on forward view is a no-op.
    },

    trackMouse: true,       // allows mouse drags on desktop during development
    preventScrollOnSwipe: true,
    delta: 30,              // minimum px to register as intentional swipe
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      // Centered layout — fills the screen, clears BottomNav with pb-28.
      // Navigation (Browse / Upload / Profile) is handled by BottomNav only.
      <div className="screen-full items-center justify-center px-8 pb-28">
        <div className="flex flex-col items-center gap-8 w-full max-w-[280px]">
          {/* Heading */}
          <div className="text-center">
            <h1 className="text-[22px] font-semibold text-brand-dark tracking-tight leading-snug">
              No items available yet.
            </h1>
            <p className="text-[14px] text-brand-dark/45 mt-3 leading-relaxed">
              Start the swap — upload your first item.
            </p>
          </div>

          {/* Primary action only — BottomNav provides all other navigation */}
          <Link
            href="/upload"
            className="
              w-full bg-brand-accent text-white
              rounded-2xl py-4
              text-[15px] font-semibold text-center tracking-wide
              active:opacity-75 transition-opacity
            "
          >
            Upload Item
          </Link>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // fixed + left-1/2 -translate-x-1/2 + max-w-app: keeps the browser within
    // the 480px column on desktop while filling the full viewport on mobile.
    // z-10: sits above page flow but below BottomNav (z-50).
    <div
      {...handlers}
      className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-app z-10 overflow-hidden bg-brand-dark"
      style={{ height: '100dvh', touchAction: 'none' }}
    >
      {/* ── Item transition layer (vertical) ──────────────────────────────── */}
      <AnimatePresence initial={false} custom={itemDir} mode="sync">
        <motion.div
          key={`item-${itemIndex}`}
          custom={itemDir}
          variants={verticalVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          className="absolute inset-0"
        >
          {view !== 'gallery' ? (
            <>
              {/* ── Image transition layer (horizontal) ──────────────────── */}
              <AnimatePresence initial={false} custom={imageDir} mode="sync">
                <motion.div
                  key={imageKey}
                  custom={imageDir}
                  variants={horizontalVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={transition}
                  className="absolute inset-0"
                >
                  {(view === 'forward' ? forwardImg : deepImages[deepIndex]) ? (
                    <img
                      src={(view === 'forward' ? forwardImg : deepImages[deepIndex])!.url}
                      alt={CATEGORY_LABELS[item.category]}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    // Placeholder shown when an item has no images yet
                    <div className="w-full h-full flex items-center justify-center bg-brand-dark/30">
                      <span className="text-brand-bg/30 text-sm">No photo</span>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* ── Forward image info overlay ────────────────────────────── */}
              {/* Only shown on the main (forward) image, not on deep images. */}
              {view === 'forward' && (
                <div
                  className="absolute bottom-0 left-0 right-0 px-5 pt-20"
                  style={{
                    // Gradient fades from dark (bottom) to transparent (top)
                    background:
                      'linear-gradient(to top, rgba(30,20,32,0.88) 0%, rgba(30,20,32,0.0) 100%)',
                    // paddingBottom clears BottomNav height + home indicator
                    paddingBottom: 'calc(5.5rem + var(--sab, 0px))',
                  }}
                >
                  {/* Category + size row — tapping opens the item detail page */}
                  <Link
                    href={`/item/${item.id}`}
                    className="flex items-baseline gap-2 mb-1.5 active:opacity-70 transition-opacity"
                  >
                    <span className="text-brand-bg text-lg font-semibold leading-tight">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    <span className="text-brand-bg/65 text-sm">
                      {item.primary_size}
                      {item.numeric_size != null ? ` · EU ${item.numeric_size}` : ''}
                    </span>
                    <span className="text-brand-bg/40 text-sm ml-auto">›</span>
                  </Link>

                  {/* Fit description */}
                  <p className="text-brand-bg/80 text-sm leading-snug mb-2">
                    {item.fit_description}
                  </p>

                  {/* Fit tags */}
                  {item.fit_tags && item.fit_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {item.fit_tags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-brand-bg/15 text-brand-bg/75 text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Credits + district */}
                  <div className="flex items-center justify-between">
                    {/*
                      PHASE 3: borrow action
                      This credit badge will become a tappable "Borrow" button
                      that opens the borrow flow (credit deduction, queue, confirmation).
                      For now it is read-only display only.
                    */}
                    <span className="text-brand-bg text-sm font-semibold">
                      {item.credit_value} credits
                    </span>

                    {/* Owner's district — shown so borrowers can estimate pickup distance */}
                    <span className="text-brand-bg/45 text-xs">
                      {item.district}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Deep image progress dots ──────────────────────────────── */}
              {/* Shown only while browsing deep images to indicate position. */}
              {view === 'deep' && deepImages.length > 1 && (
                <div
                  className="absolute left-0 right-0 flex justify-center gap-1.5"
                  style={{ bottom: 'calc(5.5rem + var(--sab, 0px))' }}
                >
                  {deepImages.map((_, i) => (
                    <span
                      key={i}
                      className={`
                        block w-1.5 h-1.5 rounded-full transition-colors duration-200
                        ${i === deepIndex ? 'bg-brand-bg' : 'bg-brand-bg/30'}
                      `}
                    />
                  ))}
                </div>
              )}

              {/* ── Swipe hint on deep image ──────────────────────────────── */}
              {/* Tells users they can swipe left to return to the forward image. */}
              {view === 'deep' && (
                <div
                  className="absolute left-4 text-brand-bg/30 text-xs"
                  style={{ bottom: 'calc(5.5rem + var(--sab, 0px) + 1.5rem)' }}
                >
                  ← back
                </div>
              )}
            </>
          ) : (
            // ── Gallery view ───────────────────────────────────────────────────
            // All images in a scrollable grid. Reached by swiping right past
            // all deep images. Swipe left or tap Close to exit.
            <motion.div
              className="absolute inset-0 bg-brand-dark/95 flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Gallery header */}
              <div
                className="flex items-center justify-between px-5 pb-4"
                style={{ paddingTop: 'calc(1rem + var(--sat, 0px))' }}
              >
                <span className="text-brand-bg text-sm font-medium">
                  All photos · {item.images.length}
                </span>
                <button
                  onClick={() => setView('forward')}
                  className="text-brand-bg/50 text-sm px-2 py-1"
                >
                  Close
                </button>
              </div>

              {/* Image grid */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-0.5">
                  {item.images.map(img => (
                    <div key={img.id} className="aspect-square">
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
                {/* Bottom padding clears home indicator */}
                <div style={{ height: 'calc(1rem + var(--sab, 0px))' }} />
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Item counter (top-right) ───────────────────────────────────────── */}
      {/* Shows current position in the feed. Hidden in gallery mode. */}
      {view !== 'gallery' && items.length > 1 && (
        <div
          className="fixed right-4 text-brand-bg/40 text-xs tabular-nums z-20 pointer-events-none"
          // Align to right edge of the 480px shell — offset from left = 50% + 240px - 1rem
          style={{
            top: 'calc(1rem + var(--sat, 0px))',
            // Right within the fixed 480px container:
            // Using transform to stay within max-w-app bounds.
            left: 'min(calc(50% + 220px), calc(100% - 1rem))',
          }}
        >
          {itemIndex + 1}/{items.length}
        </div>
      )}
    </div>
  );
}
