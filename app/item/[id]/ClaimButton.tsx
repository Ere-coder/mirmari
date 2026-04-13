/**
 * ClaimButton — client component handling the borrow/claim flow.
 *
 * Spec §CLAIM FLOW:
 * - Calls claim_item(item_id, borrower_id) RPC.
 * - Handles all structured reason codes with user-facing messages.
 * - Shows contextual disabled state (not a generic error) when user can't claim.
 *
 * Reason codes from the RPC:
 *   item_unavailable      — item is already borrowed or otherwise unavailable
 *   cannot_claim_own_item — user owns the item
 *   not_eligible          — user has not uploaded any items yet
 *   insufficient_credits  — borrower balance < item's credit_value
 *   unauthorized          — auth mismatch (should never surface in normal flow)
 *
 * Phase 6: After a successful claim the RPC returns { success: true, chat_id, borrow_id }.
 * Phase 7: Navigate to /insurance/[borrow_id] (payment step) instead of directly to chat.
 *          pay_insurance RPC then redirects to the chat on success.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ClaimResult } from '@/lib/types';
// Phase 8 §PUSH NOTIFICATIONS — server action, safe to import in client component
import { notifyOwnerOfClaim } from './actions';

interface Props {
  itemId: string;
  borrowerId: string;
  itemStatus: string;
  creditValue: number;
  isOwner: boolean;
  viewerBalance: number;
  viewerItemCount: number;
}

// Human-readable messages for each reason code returned by claim_item RPC.
const REASON_MESSAGES: Record<string, string> = {
  item_unavailable:      'This item is no longer available.',
  cannot_claim_own_item: 'This is your item.',
  not_eligible:          'Upload at least one item to start borrowing.',
  insufficient_credits:  'You don\'t have enough credits.',
  // Phase 5: owner has started the reclaim flow — no new claims accepted
  item_reclaiming:       'The owner is reclaiming this item.',
  unauthorized:          'Something went wrong. Please try again.',
};

export default function ClaimButton({
  itemId,
  borrowerId,
  itemStatus,
  creditValue,
  isOwner,
  viewerBalance,
  viewerItemCount,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Pre-flight checks (show contextual UI without calling the RPC) ─────────

  if (isOwner) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
        <p className="text-[14px] text-brand-dark/45">This is your item.</p>
      </div>
    );
  }

  if (itemStatus !== 'available') {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
        <p className="text-[14px] text-brand-dark/45">
          {itemStatus === 'borrowed' ? 'Currently borrowed.' : 'Not available.'}
        </p>
      </div>
    );
  }

  if (viewerItemCount === 0) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-5">
        <p className="text-[14px] text-brand-dark/60 leading-relaxed">
          To borrow items, upload at least one item of your own first.
        </p>
      </div>
    );
  }

  async function handleClaim() {
    setError(null);
    setLoading(true);

    const supabase = createClient();

    try {
      const { data, error: rpcError } = await supabase
        .rpc('claim_item', {
          p_item_id:     itemId,
          p_borrower_id: borrowerId,
        });

      if (rpcError) throw rpcError;

      const result = data as ClaimResult;

      if (result.success) {
        // Phase 8 §PUSH NOTIFICATIONS: notify the owner that their item was claimed.
        // Fire-and-forget — notification failure must not block navigation.
        notifyOwnerOfClaim({
          borrowerId: borrowerId,
          itemId:     itemId,
          chatId:     result.chat_id,
        }).catch(() => {});

        // Phase 7: Navigate to the insurance payment page first.
        // pay_insurance RPC redirects to /chat/[chatId] on success.
        router.push(`/insurance/${result.borrow_id}`);
      } else {
        setError(REASON_MESSAGES[result.reason] ?? 'Something went wrong. Please try again.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  const hasEnoughCredits = viewerBalance >= creditValue;

  return (
    <div className="flex flex-col gap-3">
      {/* Credit cost display */}
      {!hasEnoughCredits && (
        <div className="rounded-2xl bg-brand-surface px-5 py-3.5 flex items-center justify-between">
          <span className="text-[13px] text-brand-dark/55">Your balance</span>
          <span className="text-[13px] font-semibold text-red-400">{viewerBalance} credits</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* Claim button */}
      <button
        type="button"
        disabled={loading || !hasEnoughCredits}
        onClick={handleClaim}
        className="
          w-full bg-brand-accent text-white
          rounded-2xl py-[18px]
          text-base font-semibold tracking-wide
          transition-opacity duration-200
          disabled:opacity-40
          active:opacity-75
        "
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Claiming…
          </span>
        ) : !hasEnoughCredits ? (
          `Need ${creditValue} credits — you have ${viewerBalance}`
        ) : (
          `Borrow for ${creditValue} credits`
        )}
      </button>

      {/* Insufficient credits helper */}
      {!hasEnoughCredits && (
        <p className="text-[12px] text-brand-dark/35 text-center">
          <a href="/credits" className="text-brand-accent underline-offset-2 underline">
            Add more credits
          </a>{' '}
          to borrow this item.
        </p>
      )}
    </div>
  );
}
