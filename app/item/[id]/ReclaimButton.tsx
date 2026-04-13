/**
 * ReclaimButton — client component shown to the item owner on /item/[id]
 * when the item is currently borrowed (or available-but-reclaiming).
 *
 * Spec §OWNER RECLAIM SYSTEM:
 * - Shown when item.status === 'borrowed' and reclaiming === false.
 * - When reclaiming === true: shows "Reclaim in progress" status instead.
 * - Calls the reclaim_item(p_item_id, p_owner_id) RPC.
 * - After setting reclaiming=true: no new claims or queue entries are accepted
 *   (claim_item and join_queue both reject with 'item_reclaiming').
 * - The item continues circulating through the existing queue until it's empty,
 *   then return_item will clear reclaiming and set status='available'.
 *
 * Connects to: reclaim_item RPC (schema-phase5.sql).
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ReclaimItemResult } from '@/lib/types';

interface Props {
  itemId: string;
  ownerId: string;
  /** Whether reclaiming is already active (server-side value on mount). */
  isReclaiming: boolean;
}

export default function ReclaimButton({ itemId, ownerId, isReclaiming: initialReclaiming }: Props) {
  const router  = useRouter();
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // Optimistically track reclaiming state; server refresh confirms it.
  const [reclaiming, setReclaiming] = useState(initialReclaiming);

  // ── Reclaiming-in-progress state ──────────────────────────────────────────
  // Shown after the owner has already triggered reclaim, or if reclaiming
  // was already true when the page loaded.
  if (reclaiming) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[14px] font-semibold text-brand-dark mb-1">
          Reclaim in progress
        </p>
        <p className="text-[13px] text-brand-dark/50 leading-relaxed">
          The item will return to you after the current circulation completes.
          No new claims or queue entries are being accepted.
        </p>
      </div>
    );
  }

  // ── Reclaim handler — calls reclaim_item RPC ──────────────────────────────
  async function handleReclaim() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('reclaim_item', {
        p_item_id:  itemId,
        p_owner_id: ownerId,
      });

      if (rpcError) throw rpcError;

      const result = data as ReclaimItemResult;

      if (result.success) {
        // Optimistically flip to reclaiming state before the server refresh
        setReclaiming(true);
        router.refresh();
      } else {
        const reasonMessages: Record<string, string> = {
          already_reclaiming: 'Reclaim is already in progress.',
          item_unavailable:   'This item is not available for reclaim.',
          not_owner:          'You do not own this item.',
          unauthorized:       'Something went wrong. Please try again.',
        };
        setError(reasonMessages[result.reason] ?? 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Error display */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* Reclaim Item button */}
      <button
        type="button"
        disabled={loading}
        onClick={handleReclaim}
        className="
          w-full bg-brand-surface text-brand-dark/70
          rounded-2xl py-4
          text-[14px] font-medium
          transition-opacity duration-200
          border border-brand-dark/10
          disabled:opacity-40
          active:opacity-70
        "
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-brand-dark/20 border-t-brand-dark/50 rounded-full animate-spin" />
            Reclaiming…
          </span>
        ) : (
          'Reclaim Item'
        )}
      </button>

      {/* Helper note */}
      <p className="text-[12px] text-brand-dark/30 text-center px-2 leading-relaxed">
        Stop new borrows. The item will return after the existing queue completes.
      </p>
    </div>
  );
}
