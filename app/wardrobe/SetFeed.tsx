'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export interface OutfitSlotData {
  slot: 1 | 2 | 3;
  images: string[];
}

export interface SetRowData {
  id: string;
  code: string;
  outfits: OutfitSlotData[];
}

const SLOT_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Mon – Tue',
  2: 'Wed – Thu',
  3: 'Fri – Sat',
};

interface OpenViewer {
  setCode: string;
  slot: 1 | 2 | 3;
  images: string[];
  startIndex: number;
}

export default function SetFeed({ sets }: { sets: SetRowData[] }) {
  const [viewer, setViewer] = useState<OpenViewer | null>(null);

  return (
    <>
      <div className="flex flex-col gap-5">
        {sets.map(set => (
          <SetRow
            key={set.id}
            set={set}
            onOpen={(slot, images, startIndex) =>
              setViewer({ setCode: set.code, slot, images, startIndex })
            }
          />
        ))}
      </div>

      {viewer && (
        <FullscreenViewer
          setCode={viewer.setCode}
          slot={viewer.slot}
          images={viewer.images}
          startIndex={viewer.startIndex}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

// ── Set row: code header + horizontal scroll of 3 outfit thumbnails ─────────

function SetRow({
  set,
  onOpen,
}: {
  set: SetRowData;
  onOpen: (slot: 1 | 2 | 3, images: string[], startIndex: number) => void;
}) {
  const sorted = [...set.outfits].sort((a, b) => a.slot - b.slot);

  return (
    <section>
      <div className="px-1 mb-2 flex items-baseline justify-between">
        <p className="text-[15px] font-bold text-brand-dark">Set {set.code}</p>
        <p className="text-[10px] uppercase tracking-widest text-brand-dark/30">
          {sorted.length} outfits
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 scrollbar-none">
        {sorted.map(outfit => (
          <button
            key={outfit.slot}
            type="button"
            onClick={() => outfit.images.length > 0 && onOpen(outfit.slot, outfit.images, 0)}
            className="
              shrink-0 snap-start
              w-[42%] aspect-[3/4]
              relative rounded-2xl overflow-hidden bg-brand-surface
              active:opacity-80 transition-opacity
            "
          >
            {outfit.images[0] ? (
              <Image
                src={outfit.images[0]}
                alt={`Set ${set.code} ${SLOT_LABELS[outfit.slot]}`}
                fill
                className="object-cover"
                sizes="(max-width: 480px) 42vw, 200px"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-brand-dark/20 text-[11px]">
                Empty
              </div>
            )}
            <div className="absolute top-2 left-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-black/55 text-white">
                {SLOT_LABELS[outfit.slot]}
              </span>
            </div>
            {outfit.images.length > 1 && (
              <div className="absolute bottom-2 right-2">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/55 text-white">
                  +{outfit.images.length - 1}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Fullscreen viewer: swipe through one outfit's photos ────────────────────

function FullscreenViewer({
  setCode,
  slot,
  images,
  startIndex,
  onClose,
}: {
  setCode: string;
  slot: 1 | 2 | 3;
  images: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(startIndex);

  // Lock body scroll while open, scroll to start, and listen for Escape
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTo({ left: startIndex * el.clientWidth, behavior: 'instant' as ScrollBehavior });
      });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [startIndex, onClose]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx) setActiveIdx(idx);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white/90"
        style={{ paddingTop: 'calc(0.75rem + var(--sat, 0px))' }}
      >
        <div className="flex flex-col">
          <p className="text-[10px] uppercase tracking-widest text-white/45">
            Set {setCode} · {SLOT_LABELS[slot]}
          </p>
          <p className="text-[12px] font-semibold">
            {activeIdx + 1} of {images.length}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full bg-white/10 text-white text-[18px] flex items-center justify-center active:bg-white/20"
        >
          ×
        </button>
      </div>

      {/* Swipeable horizontal image strip */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-none touch-pan-x"
      >
        {images.map((url, i) => (
          <div key={i} className="shrink-0 w-full h-full snap-start relative">
            <Image
              src={url}
              alt={`Photo ${i + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
              priority={i === startIndex}
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div
          className="flex justify-center gap-1.5 py-3"
          style={{ paddingBottom: 'calc(0.75rem + var(--sab, 0px))' }}
        >
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/35'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
