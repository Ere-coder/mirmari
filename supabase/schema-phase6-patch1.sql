-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 6 — Patch 1
-- Run in Supabase SQL Editor AFTER schema-phase6.sql.
--
-- Problems fixed:
--
-- 1. confirm_queue_claim created no chat.
--    Every queue-based borrow had a borrow record but no chatroom, making
--    handover coordination impossible for queue borrowers.
--
-- 2. MirMari uses peer-to-peer handover (borrower → next borrower directly).
--    Items do NOT go back to the owner between borrows.
--    Therefore the chat for a queue claim must be between:
--      owner_id   = previous borrower (the person handing the item over)
--      borrower_id = new borrower     (the person receiving it)
--    NOT between the new borrower and the item owner.
--
-- 3. confirm_handover verifies the 'owner' role by checking items.owner_id.
--    For peer-to-peer this always fails because the giver is not the item owner.
--    Fix: verify against chats.owner_id instead — whoever is the giver in THIS
--    chat (item owner for direct claims, previous borrower for queue claims).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Updated confirm_queue_claim ───────────────────────────────────────────────
-- Phase 4 logic (checks, credits, borrow INSERT) is unchanged.
-- Phase 6 additions:
--   • Looks up the previous borrower (most recent returned borrow for this item).
--     That person is handing the item over peer-to-peer to the new borrower.
--   • Creates a chat:  owner_id = prev borrower (giver),
--                      borrower_id = p_user_id (receiver)
--   • Creates handover_confirmations row for dual-confirmation.
--   • Inserts opening system message.
--   • Returns { success: true, chat_id: UUID }.

CREATE OR REPLACE FUNCTION public.confirm_queue_claim(
  p_item_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item             RECORD;
  v_entry            RECORD;
  v_balance          INT;
  v_borrow_id        UUID;
  v_chat_id          UUID;
  v_prev_borrower_id UUID;
BEGIN
  -- ── Security ───────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Lock item ──────────────────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Find the turn-offered queue entry ─────────────────────────────────────
  SELECT id, position, reserved_credits, turn_offered_at, confirmation_deadline
  INTO v_entry
  FROM public.queue
  WHERE item_id         = p_item_id
    AND user_id         = p_user_id
    AND status          = 'waiting'
    AND turn_offered_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'turn_not_offered');
  END IF;

  -- ── Verify deadline has not passed ────────────────────────────────────────
  IF now() > v_entry.confirmation_deadline THEN
    RETURN jsonb_build_object('success', false, 'reason', 'deadline_expired');
  END IF;

  -- ── Re-verify effective balance ────────────────────────────────────────────
  SELECT balance INTO v_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_balance < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── All checks passed — execute atomically ────────────────────────────────

  -- Deduct credits from the new borrower
  UPDATE public.credits
  SET balance    = balance - v_item.credit_value,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (p_user_id, -v_item.credit_value, 'spent', p_item_id);

  -- Create the new borrow record
  INSERT INTO public.borrows (item_id, borrower_id, status)
  VALUES (p_item_id, p_user_id, 'pending')
  RETURNING id INTO v_borrow_id;

  -- Credit the item owner (earns on every circulation pass)
  INSERT INTO public.credits (user_id, balance)
  VALUES (v_item.owner_id, v_item.credit_value)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = public.credits.balance + EXCLUDED.balance,
        updated_at = now();

  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (v_item.owner_id, v_item.credit_value, 'earned', p_item_id);

  -- Release the soft-lock; clear turn timestamps
  UPDATE public.queue
  SET reserved_credits      = 0,
      turn_offered_at       = NULL,
      confirmation_deadline = NULL
  WHERE id = v_entry.id;

  -- Item stays 'borrowed' — a new peer-to-peer borrow is now in progress

  -- ── Phase 6 + peer-to-peer: find the previous borrower ───────────────────
  -- advance_queue is called inside return_item AFTER the previous borrow is
  -- marked 'returned'. So by the time confirm_queue_claim runs, the most
  -- recently returned borrow for this item is guaranteed to be the person
  -- who is handing the item over.
  SELECT borrower_id INTO v_prev_borrower_id
  FROM public.borrows
  WHERE item_id = p_item_id
    AND status  = 'returned'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Safety fallback: if somehow no returned borrow exists, use the item owner.
  -- In normal flow this branch is never reached.
  IF NOT FOUND THEN
    v_prev_borrower_id := v_item.owner_id;
  END IF;

  -- ── Create chat between the two parties doing the physical handover ────────
  -- owner_id   = previous borrower (the giver — handing the item over)
  -- borrower_id = new borrower      (the receiver — taking the item)
  -- The item owner is NOT a party in this chat (they are informed via credit
  -- transactions but not involved in the physical exchange).
  INSERT INTO public.chats (borrow_id, item_id, owner_id, borrower_id)
  VALUES (v_borrow_id, p_item_id, v_prev_borrower_id, p_user_id)
  RETURNING id INTO v_chat_id;

  -- Dual-confirmation row: both parties confirm the physical handover happened
  INSERT INTO public.handover_confirmations (borrow_id)
  VALUES (v_borrow_id);

  -- Opening system message — tells both parties what this chat is for
  INSERT INTO public.messages (chat_id, sender_id, content, is_system)
  VALUES (
    v_chat_id,
    p_user_id,
    'Chat to arrange handing over the clothing.',
    true
  );

  RETURN jsonb_build_object('success', true, 'chat_id', v_chat_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_queue_claim(UUID, UUID) TO authenticated;


-- ── Updated confirm_handover ──────────────────────────────────────────────────
-- The only change from the Phase 6 version: the 'owner' role is now verified
-- by checking chats.owner_id = p_user_id (whoever is the giver in THIS chat)
-- instead of items.owner_id = p_user_id.
--
-- Why: for peer-to-peer queue borrows, chat.owner_id is the previous borrower
-- (the giver), not the item owner. The old check always returned role_mismatch
-- for queue-based handovers.
--
-- For direct claims: chat.owner_id IS the item owner, so the check is identical.
-- For queue claims:  chat.owner_id IS the previous borrower (the giver).
-- Both cases are handled correctly by a single chats.owner_id lookup.

CREATE OR REPLACE FUNCTION public.confirm_handover(
  p_borrow_id UUID,
  p_user_id   UUID,
  p_role      TEXT   -- 'borrower' (receiver) or 'owner' (giver)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_borrow  RECORD;
  v_hc      RECORD;
  v_chat_id UUID;
BEGIN
  -- ── Security ───────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Validate role parameter ────────────────────────────────────────────────
  IF p_role NOT IN ('borrower', 'owner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_role');
  END IF;

  -- ── Fetch and lock borrow ──────────────────────────────────────────────────
  SELECT id, item_id, borrower_id, status
  INTO v_borrow
  FROM public.borrows
  WHERE id = p_borrow_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'borrow_not_found');
  END IF;

  -- ── Verify caller matches claimed role ────────────────────────────────────
  IF p_role = 'borrower' AND v_borrow.borrower_id != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'role_mismatch');
  END IF;

  IF p_role = 'owner' THEN
    -- Verify caller is the "giver" for this specific chat.
    -- For direct claims:  chats.owner_id = item owner.
    -- For queue/p2p:      chats.owner_id = previous borrower (the giver).
    -- Using chats.owner_id covers both cases without special-casing.
    IF NOT EXISTS (
      SELECT 1 FROM public.chats
      WHERE borrow_id = p_borrow_id
        AND owner_id  = p_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'role_mismatch');
    END IF;
  END IF;

  -- ── Fetch and lock handover_confirmation ──────────────────────────────────
  SELECT id, confirmed_by_borrower, confirmed_by_owner, fully_confirmed_at
  INTO v_hc
  FROM public.handover_confirmations
  WHERE borrow_id = p_borrow_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'confirmation_not_found');
  END IF;

  -- ── Already fully confirmed ────────────────────────────────────────────────
  IF v_hc.fully_confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'already_fully_confirmed');
  END IF;

  -- ── Record this side's confirmation ───────────────────────────────────────
  IF p_role = 'borrower' AND NOT v_hc.confirmed_by_borrower THEN
    UPDATE public.handover_confirmations
    SET confirmed_by_borrower = true,
        borrower_confirmed_at = now()
    WHERE id = v_hc.id;
    v_hc.confirmed_by_borrower := true;
  ELSIF p_role = 'owner' AND NOT v_hc.confirmed_by_owner THEN
    UPDATE public.handover_confirmations
    SET confirmed_by_owner = true,
        owner_confirmed_at = now()
    WHERE id = v_hc.id;
    v_hc.confirmed_by_owner := true;
  END IF;

  -- ── Check if both sides are now confirmed ─────────────────────────────────
  IF v_hc.confirmed_by_borrower AND v_hc.confirmed_by_owner THEN

    UPDATE public.handover_confirmations
    SET fully_confirmed_at = now()
    WHERE id = v_hc.id;

    -- Transition borrow to 'active' (unlocks experience layer uploads)
    UPDATE public.borrows
    SET status       = 'active',
        confirmed_at = now()
    WHERE id = p_borrow_id;

    -- Insert final system message in the chat
    SELECT id INTO v_chat_id FROM public.chats WHERE borrow_id = p_borrow_id;
    IF FOUND THEN
      INSERT INTO public.messages (chat_id, sender_id, content, is_system)
      VALUES (v_chat_id, p_user_id, 'Handover confirmed. Enjoy your borrow!', true);
    END IF;

    RETURN jsonb_build_object('success', true, 'result', 'fully_confirmed');
  END IF;

  RETURN jsonb_build_object('success', true, 'result', 'partial_confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_handover(UUID, UUID, TEXT) TO authenticated;
