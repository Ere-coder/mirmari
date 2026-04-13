/**
 * HandoverConfirmation — client component shown inside the chat when the
 * handover confirmation flow is active.
 *
 * Spec §HANDOVER CONFIRMATION:
 * - Both the borrower and the owner must independently confirm that the
 *   physical item exchange took place.
 * - When one side confirms, a "waiting for the other" state is shown.
 * - When both confirm, the component shows a completion message.
 *   (The confirm_handover RPC also inserts a system message and sets the
 *    borrow to 'active', which the chat page will reflect on next visit.)
 *
 * Rendered by ChatInterface when the handover is not yet fully confirmed
 * and the 2-hour prompt window has been reached.
 *
 * Connects to: confirm_handover(p_borrow_id, p_user_id, p_role) RPC.
 */
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ConfirmHandoverResult, HandoverConfirmation as HandoverConf } from '@/lib/types';

interface Props {
  borrowId: string;
  userId: string;
  /** 'owner' or 'borrower' — the current user's role in this borrow. */
  role: 'owner' | 'borrower';
  /** Server-fetched initial state; component manages optimistic updates locally. */
  initialConf: HandoverConf;
}

export default function HandoverConfirmation({ borrowId, userId, role, initialConf }: Props) {
  // Track confirmation state optimistically so the UI responds immediately.
  const [conf, setConf]     = useState(initialConf);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Derive the current state for this user's side
  const myConfirmed    = role === 'borrower' ? conf.confirmed_by_borrower : conf.confirmed_by_owner;
  const otherConfirmed = role === 'borrower' ? conf.confirmed_by_owner   : conf.confirmed_by_borrower;
  const fullyDone      = conf.fully_confirmed_at !== null;

  // ── Fully confirmed ────────────────────────────────────────────────────────
  if (fullyDone) {
    return (
      <div className="mx-4 mb-3 rounded-2xl bg-brand-surface px-5 py-4 text-center">
        <p className="text-[14px] font-semibold text-brand-dark">Handover complete</p>
        <p className="text-[12px] text-brand-dark/45 mt-1">Both sides have confirmed.</p>
      </div>
    );
  }

  // ── This side already confirmed, waiting for the other ────────────────────
  if (myConfirmed) {
    // role='owner'    = the giver  (item owner for direct borrow, prev borrower for p2p)
    // role='borrower' = the receiver
    const otherParty = role === 'borrower' ? 'the other person' : 'the receiver';
    return (
      <div className="mx-4 mb-3 rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[14px] font-semibold text-brand-dark mb-1">You&apos;ve confirmed</p>
        <p className="text-[13px] text-brand-dark/50 leading-relaxed">
          Waiting for {otherParty} to confirm.
        </p>
        {otherConfirmed && (
          <p className="text-[12px] text-brand-accent mt-1.5">
            They&apos;ve confirmed too — processing…
          </p>
        )}
      </div>
    );
  }

  // ── Confirm handler ───────────────────────────────────────────────────────
  async function handleConfirm() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('confirm_handover', {
        p_borrow_id: borrowId,
        p_user_id:   userId,
        p_role:      role,
      });
      if (rpcError) throw rpcError;
      const result = data as ConfirmHandoverResult;
      if (result.success) {
        // Optimistically update local state
        const now = new Date().toISOString();
        setConf(prev => ({
          ...prev,
          confirmed_by_borrower: role === 'borrower' ? true : prev.confirmed_by_borrower,
          confirmed_by_owner:    role === 'owner'    ? true : prev.confirmed_by_owner,
          borrower_confirmed_at: role === 'borrower' ? now  : prev.borrower_confirmed_at,
          owner_confirmed_at:    role === 'owner'    ? now  : prev.owner_confirmed_at,
          fully_confirmed_at:
            result.result === 'fully_confirmed' ? now : prev.fully_confirmed_at,
        }));
      } else {
        const reasons: Record<string, string> = {
          unauthorized:          'Something went wrong. Please try again.',
          borrow_not_found:      'Borrow record not found.',
          invalid_role:          'Role error. Please refresh.',
          role_mismatch:         'You are not authorised to confirm as this role.',
          confirmation_not_found:'Confirmation record not found.',
        };
        setError(reasons[result.reason] ?? 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Show confirm button ────────────────────────────────────────────────────
  // Button label is role-specific so it reads naturally for both the giver and
  // the receiver, regardless of whether this is a direct borrow (owner ↔ borrower)
  // or a peer-to-peer queue pass (previous borrower ↔ new borrower).
  const confirmLabel = role === 'owner'
    ? 'I handed it over'
    : 'I received it';

  return (
    <div className="mx-4 mb-3 flex flex-col gap-2">
      {/* Context card */}
      <div className="rounded-2xl bg-brand-surface px-5 py-4">
        <p className="text-[14px] font-semibold text-brand-dark mb-1">
          Has the item been handed over?
        </p>
        <p className="text-[13px] text-brand-dark/50 leading-relaxed">
          {otherConfirmed
            ? 'The other person confirmed. Tap below to complete.'
            : 'Confirm once the physical exchange has happened.'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* Confirm button */}
      <button
        type="button"
        disabled={loading}
        onClick={handleConfirm}
        className="
          w-full bg-brand-accent text-white
          rounded-2xl py-4
          text-[14px] font-semibold
          transition-opacity duration-200
          disabled:opacity-40
          active:opacity-75
        "
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Confirming…
          </span>
        ) : (
          confirmLabel
        )}
      </button>
    </div>
  );
}
