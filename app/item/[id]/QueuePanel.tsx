/**
 * QueuePanel — client component for the queue UI on /item/[id].
 *
 * Spec §ITEM PROFILE PAGE UPDATES — rendered when item.status === 'borrowed'.
 *
 * Four states (mutually exclusive):
 *
 *   1. NOT IN QUEUE
 *      Shows queue length ("X people waiting") and a "Join Queue" button.
 *      Shows inline blockers instead of the button if the user:
 *        - has no uploaded items (not_eligible)
 *        - has insufficient effective credits
 *
 *   2. IN QUEUE (waiting, no turn yet)
 *      Shows "You are Nth in line" and a "Cancel Claim" button.
 *
 *   3. TURN OFFERED (turn_offered_at set, deadline not yet passed)
 *      Shows "It's your turn! Confirm to claim." with a live countdown
 *      and a "Claim Now" button. Calls confirm_queue_claim RPC.
 *
 *   4. TURN MISSED (turn_offered_at set, confirmation_deadline passed)
 *      Shows "You missed your turn. You have been moved to the bottom."
 *      advance_queue (Phase 5) will re-insert the user on the next return.
 *
 * Connects to RPCs: join_queue, cancel_queue, confirm_queue_claim (all in schema-phase4.sql).
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type {
  QueueEntry,
  JoinQueueResult,
  CancelQueueResult,
  ConfirmQueueClaimResult,
} from '@/lib/types';

interface Props {
  itemId: string;
  /** Current viewer's user id. */
  userId: string;
  /** Item's credit_value — shown in eligibility messages. */
  creditValue: number;
  /** Count of waiting queue entries (from server, includes this user if already queued). */
  queueLength: number;
  /** Viewer's current waiting entry for this item, or null if not in queue. */
  userEntry: QueueEntry | null;
  /** Viewer's effective balance: credits.balance − total reserved in other queues. */
  effectiveBalance: number;
  /** Number of items the viewer has uploaded (0 = not eligible to queue). */
  viewerItemCount: number;
  /**
   * Phase 5 — whether the owner has initiated a reclaim.
   * When true: hide the "Join Queue" button and show a reclaiming notice instead.
   * Existing queue members (inQueue = true) are unaffected and still see their position.
   */
  reclaiming?: boolean;
}

// ── Human-readable messages for join_queue failure reasons ─────────────────────
const JOIN_REASON_MESSAGES: Record<string, string> = {
  item_not_borrowed:     'This item is no longer borrowed — try claiming it directly.',
  cannot_queue_own_item: 'This is your item.',
  not_eligible:          'Upload at least one item to join the queue.',
  already_in_queue:      'You are already in the queue for this item.',
  insufficient_credits:  "You don't have enough credits.",
  unauthorized:          'Something went wrong. Please try again.',
};

// ── Human-readable messages for confirm_queue_claim failure reasons ────────────
const CONFIRM_REASON_MESSAGES: Record<string, string> = {
  turn_not_offered:    'It is not your turn yet.',
  deadline_expired:    'Your confirmation window has expired.',
  insufficient_credits: "You no longer have enough credits.",
  unauthorized:        'Something went wrong. Please try again.',
};

// ── Ordinal suffix helper (1st, 2nd, 3rd, 4th, …) ─────────────────────────────
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Countdown formatter — shows hours/minutes/seconds remaining ────────────────
function formatCountdown(deadline: Date): string {
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) return '0s';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

export default function QueuePanel({
  itemId,
  userId,
  creditValue,
  queueLength,
  userEntry,
  effectiveBalance,
  viewerItemCount,
  reclaiming = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // Live countdown string, updated every second in the "turn offered" state.
  const [countdown, setCountdown] = useState<string | null>(null);

  // ── Derive state from userEntry ───────────────────────────────────────────────
  const deadline = userEntry?.confirmation_deadline
    ? new Date(userEntry.confirmation_deadline)
    : null;

  const deadlinePassed = deadline !== null && Date.now() > deadline.getTime();
  const turnOffered    = userEntry?.turn_offered_at != null && !deadlinePassed;
  const inQueue        = userEntry !== null;

  // ── Live countdown for "It's your turn!" state ────────────────────────────────
  // Refreshes page when deadline passes so the server re-renders the missed-turn state.
  useEffect(() => {
    if (!deadline || deadlinePassed) return;

    setCountdown(formatCountdown(deadline));

    const interval = setInterval(() => {
      if (Date.now() >= deadline.getTime()) {
        clearInterval(interval);
        // Refresh server component so we get the post-deadline state from DB
        router.refresh();
      } else {
        setCountdown(formatCountdown(deadline));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, deadlinePassed, router]);

  // ── Join queue ─────────────────────────────────────────────────────────────────
  async function handleJoin() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('join_queue', {
        p_item_id: itemId,
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;
      const result = data as JoinQueueResult;
      if (result.success) {
        // Refresh server component to get updated queue state
        router.refresh();
      } else {
        setError(JOIN_REASON_MESSAGES[result.reason] ?? 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Cancel queue ──────────────────────────────────────────────────────────────
  async function handleCancel() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_queue', {
        p_item_id: itemId,
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;
      const result = data as CancelQueueResult;
      if (result.success) {
        router.refresh();
      } else {
        setError('Could not cancel. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Confirm queue claim ───────────────────────────────────────────────────────
  async function handleConfirm() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('confirm_queue_claim', {
        p_item_id: itemId,
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;
      const result = data as ConfirmQueueClaimResult;
      if (result.success) {
        // Phase 6: confirm_queue_claim now returns a chat_id (same as claim_item).
        // Navigate to the chatroom so the borrower can coordinate handover with the owner.
        router.push(`/chat/${result.chat_id}`);
      } else {
        setError(CONFIRM_REASON_MESSAGES[result.reason] ?? 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Shared error display ──────────────────────────────────────────────────────
  const errorBlock = error && (
    <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
  );

  // ── Shared loading spinner ────────────────────────────────────────────────────
  const spinner = (
    <span className="inline-flex items-center justify-center gap-2.5">
      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      Loading…
    </span>
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE 3: It's the user's turn (turn offered, deadline not yet passed)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (turnOffered) {
    return (
      <div className="flex flex-col gap-3">
        {/* Turn notification banner */}
        <div className="rounded-2xl bg-brand-surface px-5 py-4">
          <p className="text-[15px] font-semibold text-brand-dark mb-1">
            It&apos;s your turn!
          </p>
          <p className="text-[13px] text-brand-dark/55 leading-relaxed">
            Confirm below to claim this item.
          </p>
          {/* Countdown — live-updated by the useEffect interval */}
          {countdown && (
            <p className="text-[12px] text-brand-accent font-medium mt-2">
              {countdown}
            </p>
          )}
        </div>

        {errorBlock}

        {/* Claim Now button — calls confirm_queue_claim RPC */}
        <button
          type="button"
          disabled={loading}
          onClick={handleConfirm}
          className="
            w-full bg-brand-accent text-white
            rounded-2xl py-[18px]
            text-base font-semibold tracking-wide
            transition-opacity duration-200
            disabled:opacity-40
            active:opacity-75
          "
        >
          {loading ? spinner : `Claim Now — ${creditValue} credits`}
        </button>

        {/* Cancel option even when turn is offered */}
        <button
          type="button"
          disabled={loading}
          onClick={handleCancel}
          className="
            w-full bg-brand-surface text-brand-dark/60
            rounded-2xl py-4
            text-[14px] font-medium
            transition-opacity duration-200
            disabled:opacity-40
            active:opacity-70
          "
        >
          Cancel Claim
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE 4: User missed their turn (deadline passed, advance_queue will re-insert
  //          on next Phase 5 return event)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (inQueue && deadlinePassed) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[14px] font-semibold text-brand-dark mb-1">
          You missed your turn.
        </p>
        <p className="text-[13px] text-brand-dark/50 leading-relaxed">
          You have been moved to the bottom of the queue.
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE 2: User is in queue (waiting, no turn offered yet)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (inQueue && userEntry) {
    return (
      <div className="flex flex-col gap-3">
        {/* Position indicator */}
        <div className="rounded-2xl bg-brand-surface px-5 py-4">
          <p className="text-[14px] text-brand-dark leading-relaxed">
            You have claimed this item. You are{' '}
            <span className="font-semibold">{ordinal(userEntry.position)}</span>{' '}
            in line.
          </p>
          {/* Show soft-locked credits so the user understands their balance impact */}
          <p className="text-[12px] text-brand-dark/40 mt-1.5">
            {userEntry.reserved_credits} credits reserved
          </p>
        </div>

        {errorBlock}

        {/* Cancel Claim button — calls cancel_queue RPC */}
        <button
          type="button"
          disabled={loading}
          onClick={handleCancel}
          className="
            w-full bg-brand-surface text-brand-dark/60
            rounded-2xl py-4
            text-[14px] font-medium
            transition-opacity duration-200
            disabled:opacity-40
            active:opacity-70
          "
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2.5">
              <span className="w-4 h-4 border-2 border-brand-dark/20 border-t-brand-dark/50 rounded-full animate-spin" />
              Cancelling…
            </span>
          ) : (
            'Cancel Claim'
          )}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE 1: User is not in queue — show queue length + join button (or blockers)
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── Blocker (Phase 5): owner is reclaiming the item ──────────────────────────
  // Spec §OWNER RECLAIM SYSTEM: "hide Join Queue button for non-queue users;
  // show 'This item is being reclaimed by the owner'."
  // Only applies to users who are NOT already in the queue (inQueue handles
  // existing members — they continue to see their position above).
  if (reclaiming) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[14px] text-brand-dark/65 leading-relaxed">
          This item is being reclaimed by the owner.
        </p>
        {queueLength > 0 && (
          <p className="text-[12px] text-brand-dark/35 mt-1.5">
            {queueLength === 1 ? '1 person' : `${queueLength} people`} still in queue.
          </p>
        )}
      </div>
    );
  }

  // ── Blocker: user has no uploaded items ───────────────────────────────────────
  if (viewerItemCount === 0) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-5">
        <p className="text-[14px] text-brand-dark/60 leading-relaxed">
          Upload at least one item to join the queue.
        </p>
      </div>
    );
  }

  const hasEnoughCredits = effectiveBalance >= creditValue;

  return (
    <div className="flex flex-col gap-3">
      {/* Queue length — shown above the join button */}
      <div className="rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[14px] text-brand-dark/65">
          {queueLength === 0
            ? 'No one is waiting yet.'
            : queueLength === 1
            ? '1 person waiting'
            : `${queueLength} people waiting`}
        </p>
      </div>

      {/* Insufficient credits warning */}
      {!hasEnoughCredits && (
        <div className="rounded-2xl bg-brand-surface px-5 py-3.5 flex items-center justify-between">
          <span className="text-[13px] text-brand-dark/55">Available balance</span>
          <span className="text-[13px] font-semibold text-red-400">
            {effectiveBalance} credits
          </span>
        </div>
      )}

      {errorBlock}

      {/* Join Queue button — calls join_queue RPC */}
      <button
        type="button"
        disabled={loading || !hasEnoughCredits}
        onClick={handleJoin}
        className="
          w-full bg-brand-accent text-white
          rounded-2xl py-[18px]
          text-base font-semibold tracking-wide
          transition-opacity duration-200
          disabled:opacity-40
          active:opacity-75
        "
      >
        {loading ? spinner : !hasEnoughCredits
          ? `Need ${creditValue} credits — you have ${effectiveBalance}`
          : `Join Queue — ${creditValue} credits`}
      </button>

      {/* Insufficient credits link to /credits */}
      {!hasEnoughCredits && (
        <p className="text-[12px] text-brand-dark/35 text-center">
          <Link href="/credits" className="text-brand-accent underline underline-offset-2">
            Add more credits
          </Link>{' '}
          to join the queue.
        </p>
      )}
    </div>
  );
}
