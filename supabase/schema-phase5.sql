-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 5 Schema
-- Run in Supabase SQL Editor AFTER schema.sql, schema-phase2.sql,
-- schema-phase3.sql, and schema-phase4.sql (in order).
--
-- Adds:
--   • Column: items.reclaiming (boolean, default false)
--   • Updated RPC: claim_item  — reject if item is reclaiming
--   • Updated RPC: join_queue  — reject if item is reclaiming
--   • RPC: return_item          — borrower returns; triggers queue advance or availability
--   • RPC: reclaim_item         — owner flags item for reclaim after circulation
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add reclaiming column to items ────────────────────────────────────────────
-- When reclaiming = true the owner has signalled they want the item back.
-- Behaviour:
--   • No new claims (claim_item rejects with 'item_reclaiming')
--   • No new queue entries (join_queue rejects with 'item_reclaiming')
--   • Existing queue entries continue to circulate normally
--   • Once the final return happens with an empty queue, reclaiming is cleared
--     and item becomes available for the owner to re-list

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS reclaiming BOOLEAN NOT NULL DEFAULT false;

-- Note: items_update_own (created in schema-phase2.sql) already allows the
-- item owner to UPDATE any column on their own items via authenticated clients.
-- The reclaim_item RPC runs SECURITY DEFINER so it bypasses RLS regardless.
-- No additional RLS policy is needed.

-- ── Updated claim_item RPC ─────────────────────────────────────────────────────
-- Phase 5 change: adds reclaiming check after the status check.
-- If reclaiming = true, new claims are rejected so the item can return to owner.
-- All other logic is identical to the Phase 3 version.

CREATE OR REPLACE FUNCTION public.claim_item(
  p_item_id     UUID,
  p_borrower_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item             RECORD;
  v_borrower_balance INT;
  v_item_count       INT;
BEGIN
  -- ── Security: caller must be the borrower ─────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Step 1: Lock item row ─────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status, reclaiming
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_unavailable');
  END IF;

  -- ── Step 2: Item must be available ────────────────────────────────────────
  IF v_item.status != 'available' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_unavailable');
  END IF;

  -- ── Step 2b (Phase 5): Reject if owner has initiated a reclaim ────────────
  -- reclaiming = true means the owner wants the item back; no new claims allowed.
  IF v_item.reclaiming THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_reclaiming');
  END IF;

  -- ── Step 3: Borrower cannot claim their own item ──────────────────────────
  IF v_item.owner_id = p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_claim_own_item');
  END IF;

  -- ── Step 4: Borrower must have at least one uploaded item ─────────────────
  SELECT COUNT(*) INTO v_item_count
  FROM public.items
  WHERE owner_id = p_borrower_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- ── Step 5: Check and lock borrower's credit balance ─────────────────────
  SELECT balance INTO v_borrower_balance
  FROM public.credits
  WHERE user_id = p_borrower_id
  FOR UPDATE;

  IF NOT FOUND OR v_borrower_balance < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── All checks passed — execute atomically ────────────────────────────────

  -- Step 6: Deduct credits from borrower
  UPDATE public.credits
  SET balance    = balance - v_item.credit_value,
      updated_at = now()
  WHERE user_id = p_borrower_id;

  -- Step 7: Record deduction transaction for borrower
  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (p_borrower_id, -v_item.credit_value, 'spent', p_item_id);

  -- Step 8: Create borrow record (status: pending — owner confirmation is Phase 6)
  INSERT INTO public.borrows (item_id, borrower_id, status)
  VALUES (p_item_id, p_borrower_id, 'pending');

  -- Step 9: Credit the item owner
  INSERT INTO public.credits (user_id, balance)
  VALUES (v_item.owner_id, v_item.credit_value)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = public.credits.balance + EXCLUDED.balance,
        updated_at = now();

  -- Step 10: Record earning transaction for owner
  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (v_item.owner_id, v_item.credit_value, 'earned', p_item_id);

  -- Step 11: Mark item as borrowed
  UPDATE public.items
  SET status = 'borrowed'
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_item(UUID, UUID) TO authenticated;

-- ── Updated join_queue RPC ─────────────────────────────────────────────────────
-- Phase 5 change: adds reclaiming check after the item status check.
-- If reclaiming = true, new queue entries are rejected so the item can
-- return to the owner after the existing queue drains.
-- All other logic is identical to the Phase 4 version.

CREATE OR REPLACE FUNCTION public.join_queue(
  p_item_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item           RECORD;
  v_user_balance   INT;
  v_total_reserved INT;
  v_effective_bal  INT;
  v_item_count     INT;
  v_next_position  INT;
  v_existing       UUID;
BEGIN
  -- ── Security: caller must be the user ────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Step 1: Lock item row ─────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status, reclaiming
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Step 2: Item must be borrowed ─────────────────────────────────────────
  IF v_item.status != 'borrowed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_borrowed');
  END IF;

  -- ── Step 2b (Phase 5): Reject if owner is reclaiming ─────────────────────
  -- Existing queue members keep their entries; only new entries are blocked.
  IF v_item.reclaiming THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_reclaiming');
  END IF;

  -- ── Step 3: User cannot queue for their own item ──────────────────────────
  IF v_item.owner_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_queue_own_item');
  END IF;

  -- ── Step 4: User must have at least one uploaded item ─────────────────────
  SELECT COUNT(*) INTO v_item_count
  FROM public.items
  WHERE owner_id = p_user_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- ── Step 5: Prevent duplicate waiting entry ───────────────────────────────
  SELECT id INTO v_existing
  FROM public.queue
  WHERE item_id = p_item_id
    AND user_id = p_user_id
    AND status  = 'waiting';

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_in_queue');
  END IF;

  -- ── Step 6: Check effective credit balance ────────────────────────────────
  SELECT balance INTO v_user_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  SELECT COALESCE(SUM(reserved_credits), 0) INTO v_total_reserved
  FROM public.queue
  WHERE user_id = p_user_id
    AND status  = 'waiting';

  v_effective_bal := v_user_balance - v_total_reserved;

  IF v_effective_bal < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── Step 7: Calculate next queue position ────────────────────────────────
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
  FROM public.queue
  WHERE item_id = p_item_id
    AND status  = 'waiting';

  -- ── Step 8: Insert queue entry with soft-locked credits ───────────────────
  INSERT INTO public.queue (item_id, user_id, position, status, reserved_credits)
  VALUES (p_item_id, p_user_id, v_next_position, 'waiting', v_item.credit_value);

  RETURN jsonb_build_object('success', true, 'position', v_next_position);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_queue(UUID, UUID) TO authenticated;

-- ── return_item RPC ────────────────────────────────────────────────────────────
-- Called when the active borrower taps "Return Item" on /item/[id].
-- Handles all return paths atomically:
--
--   Path A — queue has waiting entries:
--     → mark borrow returned, call advance_queue to pass item to next person
--     → item stays 'borrowed', next user is offered their turn
--
--   Path B — queue empty, item is being reclaimed:
--     → mark borrow returned, item → 'available', reclaiming → false
--     → item is back with owner; circulation complete
--
--   Path C — queue empty, not reclaiming:
--     → mark borrow returned, item → 'available'
--     → item open for new claims
--
-- Spec §RETURN ACTION + §PASS-FORWARD RETURN.
--
-- Return values:
--   { success: true, next_state: 'next_in_queue' }  — advance_queue was called
--   { success: true, next_state: 'reclaim_complete' } — item back to owner
--   { success: true, next_state: 'available' }        — item open for new claims
--   { success: false, reason: string }
--
-- [ADDED: accepts borrow.status IN ('pending','active') — borrows created by
--  claim_item start as 'pending' since there is no owner handoff-confirmation UI
--  in Phase 5 (deferred to Phase 6). Treating pending as active is strictly
--  necessary for the return flow to work end-to-end in this phase.]

CREATE OR REPLACE FUNCTION public.return_item(
  p_item_id     UUID,
  p_borrower_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item           RECORD;
  v_borrow         RECORD;
  v_queue_count    INT;
  v_advance_result JSONB;
BEGIN
  -- ── Security: caller must be the borrower ─────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Step 1a: Lock item row ────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status, reclaiming
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Step 1b: Verify caller is the active borrower ─────────────────────────
  -- Selects the most recent pending/active borrow for this borrower.
  -- 'pending' is accepted because claim_item creates borrows as 'pending'
  -- (owner handoff confirmation is Phase 6; see [ADDED] note above).
  SELECT id, borrower_id, status
  INTO v_borrow
  FROM public.borrows
  WHERE item_id     = p_item_id
    AND borrower_id = p_borrower_id
    AND status IN ('pending', 'active')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_active_borrower');
  END IF;

  -- ── Step 2: Mark borrow as returned ──────────────────────────────────────
  UPDATE public.borrows
  SET status      = 'returned',
      returned_at = now()
  WHERE id = v_borrow.id;

  -- ── Determine return path based on queue state ────────────────────────────
  SELECT COUNT(*) INTO v_queue_count
  FROM public.queue
  WHERE item_id = p_item_id
    AND status  = 'waiting';

  -- ── Path B: reclaiming = true AND queue empty → item back to owner ─────────
  -- The item has drained the existing queue and can now return to the owner.
  -- Clear reclaiming so it is available for fresh claims when re-listed.
  IF v_item.reclaiming AND v_queue_count = 0 THEN
    UPDATE public.items
    SET status     = 'available',
        reclaiming = false
    WHERE id = p_item_id;

    RETURN jsonb_build_object('success', true, 'next_state', 'reclaim_complete');
  END IF;

  -- ── Path A: queue has waiting entries → pass forward to next person ────────
  -- advance_queue (Phase 4) handles all queue progression logic:
  --   • finds first eligible waiting user
  --   • sets turn_offered_at + confirmation_deadline
  --   • skips ineligible users (re-inserts at bottom)
  --   • sets item to 'available' if entire queue is exhausted
  IF v_queue_count > 0 THEN
    v_advance_result := public.advance_queue(p_item_id);

    -- If advance_queue exhausted the queue and set the item back to 'available',
    -- also clear reclaiming so the item is fully available for new claims/re-list.
    -- (advance_queue doesn't know about the reclaiming flag, so we clean it up here.)
    IF v_item.reclaiming THEN
      UPDATE public.items
      SET reclaiming = false
      WHERE id     = p_item_id
        AND status = 'available';  -- only update if advance_queue set it to available
    END IF;

    RETURN jsonb_build_object(
      'success',  true,
      'next_state', 'next_in_queue',
      'advance',  v_advance_result
    );
  END IF;

  -- ── Path C: queue empty, not reclaiming → item open for new claims ─────────
  UPDATE public.items
  SET status = 'available'
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'next_state', 'available');
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_item(UUID, UUID) TO authenticated;

-- ── reclaim_item RPC ───────────────────────────────────────────────────────────
-- Called when the owner taps "Reclaim Item" on their own item page.
-- Sets reclaiming = true, which:
--   • Prevents new claims (claim_item checks reclaiming)
--   • Prevents new queue entries (join_queue checks reclaiming)
--   • Does NOT cancel existing queue entries — item circulates normally
--   • Once the final return occurs with an empty queue, return_item clears
--     reclaiming and sets item back to available
--
-- Spec §OWNER RECLAIM SYSTEM + §RECLAIM RPC.
--
-- Reason codes:
--   unauthorized      — auth.uid() != p_owner_id
--   item_not_found    — item does not exist
--   not_owner         — caller is not the item owner
--   item_unavailable  — item.status = 'unavailable' (admin-disabled)
--   already_reclaiming — reclaiming is already true
--
-- Returns: { success: true } or { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.reclaim_item(
  p_item_id  UUID,
  p_owner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- ── Security: caller must be the owner ────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_owner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Lock item row ─────────────────────────────────────────────────────────
  SELECT id, owner_id, status, reclaiming
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Verify ownership ──────────────────────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS; this explicit check is the ownership guard.
  IF v_item.owner_id != p_owner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_owner');
  END IF;

  -- ── Item must not be admin-disabled ───────────────────────────────────────
  IF v_item.status = 'unavailable' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_unavailable');
  END IF;

  -- ── Idempotency: already reclaiming ──────────────────────────────────────
  IF v_item.reclaiming THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_reclaiming');
  END IF;

  -- ── Set reclaiming flag ───────────────────────────────────────────────────
  -- Behaviour depends on current state:
  --   status = 'borrowed': item continues circulating through the existing queue;
  --                        no new entries allowed; cleared on final return.
  --   status = 'available': no active borrow; item is locked from new claims
  --                         until the owner re-lists (sets reclaiming = false
  --                         or status = unavailable — Phase 6 admin tools).
  UPDATE public.items
  SET reclaiming = true
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclaim_item(UUID, UUID) TO authenticated;
