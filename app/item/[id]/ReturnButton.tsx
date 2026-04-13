/**
 * ReturnButton — client component shown to the active borrower on /item/[id].
 *
 * Spec §RETURN ACTION:
 * - Visible only to the user whose borrows row has status IN ('pending','active')
 *   for this item. (The server component confirms eligibility before rendering this.)
 * - Calls the return_item(p_item_id, p_borrower_id) RPC atomically.
 * - Shows a context-appropriate confirmation message based on next_state:
 *     'next_in_queue'    → the item passes to the next person in queue
 *     'reclaim_complete' → the owner has reclaimed the item; circulation done
 *     'available'        → the item is now open for new claims
 * - Refreshes the page after success so the updated item state is visible.
 *
 * Connects to: return_item RPC (schema-phase5.sql).
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ReturnItemResult } from '@/lib/types';
// Phase 8 §PUSH NOTIFICATIONS
import { notifyNextInQueue } from './actions';

interface Props {
  itemId: string;
  borrowerId: string;
}

// ── Post-return confirmation messages keyed by next_state ──────────────────────
const NEXT_STATE_MESSAGES: Record<string, { title: string; body: string }> = {
  next_in_queue: {
    title: 'Item returned.',
    body:  'The next person in the queue has been notified.',
  },
  reclaim_complete: {
    title: 'Item returned to owner.',
    body:  'The owner has reclaimed the item. Circulation complete.',
  },
  available: {
    title: 'Item returned.',
    body:  'The item is now available for others to borrow.',
  },
};

export default function ReturnButton({ itemId, borrowerId }: Props) {
  const router = useRouter();
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // Holds the next_state string after a successful return, to show confirmation.
  const [returned, setReturned] = useState<string | null>(null);

  // ── Confirmation state: shown after a successful return ────────────────────
  if (returned) {
    const msg = NEXT_STATE_MESSAGES[returned] ?? {
      title: 'Item returned.',
      body:  'Thank you for returning the item.',
    };
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[15px] font-semibold text-brand-dark mb-1">{msg.title}</p>
        <p className="text-[13px] text-brand-dark/55 leading-relaxed">{msg.body}</p>
      </div>
    );
  }

  // ── Return handler — calls return_item RPC ────────────────────────────────
  async function handleReturn() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('return_item', {
        p_item_id:     itemId,
        p_borrower_id: borrowerId,
      });

      if (rpcError) throw rpcError;

      const result = data as ReturnItemResult;

      if (result.success) {
        // Phase 8 §PUSH NOTIFICATIONS: notify next user in queue when turn is offered.
        // Fire-and-forget — notification failure must not block the return flow.
        if (result.next_state === 'next_in_queue') {
          notifyNextInQueue({ itemId }).catch(() => {});
        }
        // Show confirmation, then refresh the server component so the item
        // page reflects its new status (available / borrowed by next user).
        setReturned(result.next_state);
        router.refresh();
      } else {
        const msg = result.reason === 'not_active_borrower'
          ? 'Could not verify your borrow. Please try again.'
          : 'Something went wrong. Please try again.';
        setError(msg);
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

      {/* Return Item button */}
      <button
        type="button"
        disabled={loading}
        onClick={handleReturn}
        className="
          w-full bg-brand-dark text-brand-bg
          rounded-2xl py-[18px]
          text-base font-semibold tracking-wide
          transition-opacity duration-200
          disabled:opacity-40
          active:opacity-75
        "
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-brand-bg/30 border-t-brand-bg rounded-full animate-spin" />
            Returning…
          </span>
        ) : (
          'Return Item'
        )}
      </button>

      {/* Helper note */}
      <p className="text-[12px] text-brand-dark/30 text-center px-2 leading-relaxed">
        Confirm that you have handed the item back to the owner or passed it forward.
      </p>
    </div>
  );
}
