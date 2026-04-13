/**
 * ImageViewer — client component for the item detail page.
 *
 * Shows the main (forward) image large at the top, with a thumbnail row below.
 * Tapping any thumbnail makes it the active main image.
 * Tapping the main image opens a full-screen lightbox.
 *
 * Spec §ITEM PROFILE PAGE: "full-screen image viewer with thumbnails".
 */
'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CATEGORY_LABELS, type ItemCategory, type ImageLayer } from '@/lib/types';

interface Image {
  id: string;
  url: string;
  is_forward: boolean;
  layer: ImageLayer;
}

interface Props {
  images: Image[];
  category: ItemCategory;
}

export default function ImageViewer({ images, category }: Props) {
  const [activeIndex, setActiveIndex]   = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const activeImage = images[activeIndex];

  if (images.length === 0) {
    return (
      <div className="w-full bg-brand-dark/10 flex items-center justify-center" style={{ height: '60vw', maxHeight: 360 }}>
        <span className="text-brand-dark/30 text-sm">No photo</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Main image ──────────────────────────────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden cursor-zoom-in"
        style={{
          height: 'min(70vw, 420px)',
          // Offset for back button — add top padding equal to safe area + nav height
          paddingTop: 'calc(3rem + var(--sat, 0px))',
        }}
        onClick={() => setLightboxOpen(true)}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={activeImage.id}
            src={activeImage.url}
            alt={CATEGORY_LABELS[category]}
            className="w-full h-full object-cover"
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
        </AnimatePresence>

        {/* Tap to expand hint */}
        <div className="absolute bottom-3 right-3 bg-brand-dark/40 backdrop-blur-sm rounded-full px-2.5 py-1">
          <span className="text-brand-bg text-[11px]">Tap to expand</span>
        </div>
      </div>

      {/* ── Thumbnail strip ─────────────────────────────────────────────────── */}
      {images.length > 1 && (
        <div className="flex gap-2 px-5 pt-3 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`
                flex-none w-16 h-16 rounded-xl overflow-hidden
                transition-all duration-150
                ${i === activeIndex
                  ? 'ring-2 ring-brand-accent ring-offset-1'
                  : 'opacity-60 active:opacity-90'}
              `}
            >
              <img
                src={img.url}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Full-screen lightbox ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLightboxOpen(false)}
          >
            <img
              src={activeImage.url}
              alt={CATEGORY_LABELS[category]}
              className="w-full h-full object-contain"
              draggable={false}
            />
            {/* Close button */}
            <button
              className="absolute top-4 right-4 text-white/60 text-[13px] px-3 py-2"
              onClick={() => setLightboxOpen(false)}
              style={{ paddingTop: 'calc(0.5rem + var(--sat, 0px))' }}
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
