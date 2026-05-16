'use client';

/**
 * BookingCalendar — set-first booking UI.
 *
 * Shows all sets in the season. For each set:
 *   - If the user has a booking → shows the week + Cancel
 *   - If a next-available week exists → shows it + Book
 *   - If the set is fully booked in the cycle → shows "No availability"
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bookNextAvailableWeek, cancelReservation } from './actions';

export interface SetSlot {
  id:   string;
  code: string;
  images: string[];
  /** User's confirmed booking for this set, if any */
  reservation: { id: string; weekStart: string } | null;
  /** Next week this set is free AND user has no booking — null = fully booked */
  nextAvailableWeek: string | null;
}

interface Props {
  sets: SetSlot[];
}

function formatWeek(weekStart: string): string {
  const d   = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(d)} – ${fmt(end)}`;
}

export default function BookingCalendar({ sets }: Props) {
  const router = useRouter();
  const [error, setError]            = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingSetId, setPendingId] = useState<string | null>(null);

  function handleBook(setId: string) {
    setError(null);
    setPendingId(setId);
    startTransition(async () => {
      const result = await bookNextAvailableWeek(setId);
      setPendingId(null);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleCancel(reservationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelReservation(reservationId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const booked    = sets.filter(s => s.reservation !== null);
  const available = sets.filter(s => s.reservation === null && s.nextAvailableWeek !== null);
  const full      = sets.filter(s => s.reservation === null && s.nextAvailableWeek === null);

  return (
    <div className="flex flex-col gap-6 px-4" style={{ paddingBottom: 'calc(6rem + var(--sab, 0px))' }}>
      {error && (
        <p className="text-[12px] text-red-500">{error}</p>
      )}

      {/* ── Your bookings ──────────────────────────────────────────────── */}
      {booked.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
            Your bookings
          </p>
          <div className="flex flex-col gap-3">
            {booked.map(set => (
              <SetCard key={set.id} set={set}>
                <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-brand-dark/[0.04]">
                  <div>
                    <p className="text-[12px] font-semibold text-green-600">Confirmed</p>
                    <p className="text-[11px] text-brand-dark/40 mt-0.5">
                      {formatWeek(set.reservation!.weekStart)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancel(set.reservation!.id)}
                    disabled={isPending}
                    className="text-[12px] text-brand-dark/35 active:text-red-400 transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </SetCard>
            ))}
          </div>
        </section>
      )}

      {/* ── Available sets ─────────────────────────────────────────────── */}
      {available.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
            Available
          </p>
          <div className="flex flex-col gap-3">
            {available.map(set => (
              <SetCard key={set.id} set={set}>
                <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-brand-dark/[0.04]">
                  <p className="text-[11px] text-brand-dark/40">
                    {formatWeek(set.nextAvailableWeek!)}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleBook(set.id)}
                    disabled={isPending}
                    className="
                      bg-brand-accent text-brand-bg
                      rounded-xl px-4 py-1.5 text-[12px] font-semibold
                      active:opacity-80 transition-opacity disabled:opacity-40
                    "
                  >
                    {pendingSetId === set.id ? 'Booking…' : 'Book'}
                  </button>
                </div>
              </SetCard>
            ))}
          </div>
        </section>
      )}

      {/* ── Fully booked ───────────────────────────────────────────────── */}
      {full.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
            No availability
          </p>
          <div className="flex flex-col gap-3">
            {full.map(set => (
              <SetCard key={set.id} set={set} dimmed>
                <div className="px-4 py-2.5 border-t border-brand-dark/[0.04]">
                  <p className="text-[11px] text-brand-dark/30">Fully booked this cycle</p>
                </div>
              </SetCard>
            ))}
          </div>
        </section>
      )}

      {sets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-brand-dark/40">No outfit sets in the current season.</p>
        </div>
      )}
    </div>
  );
}

function SetCard({
  set,
  dimmed,
  children,
}: {
  set:      SetSlot;
  dimmed?:  boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl bg-white border border-brand-dark/[0.06] overflow-hidden ${dimmed ? 'opacity-40' : ''}`}>
      {/* Image strip */}
      {set.images.length > 0 && (
        <div className={`grid gap-0.5 ${set.images.length >= 4 ? 'grid-cols-4' : `grid-cols-${set.images.length}`}`}>
          {set.images.slice(0, 4).map((url, i) => (
            <div key={i} className="aspect-square">
              <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
          ))}
        </div>
      )}
      {/* Set label row */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="
          w-6 h-6 rounded-full bg-brand-dark/[0.06]
          flex items-center justify-center
          text-[11px] font-bold text-brand-dark/50
        ">
          {set.code}
        </span>
        <span className="text-[13px] font-medium text-brand-dark">Set {set.code}</span>
      </div>
      {children}
    </div>
  );
}
