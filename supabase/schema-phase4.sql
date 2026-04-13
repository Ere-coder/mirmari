-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 4 Schema
-- Run in Supabase SQL Editor AFTER schema.sql, schema-phase2.sql, schema-phase3.sql.
--
-- Adds:
--   • Enum:  queue_status (waiting, skipped, cancelled)
--   • Table: queue (soft-lock queue for borrowed items)
--   • Partial unique indexes on queue (waiting-only uniqueness)
--   • RLS policies for queue table
--   • RPC: join_queue    — atomic queue entry with credit soft-lock
--   • RPC: cancel_queue  — atomic cancellation with position reorder
--   • RPC: advance_queue — queue progression (called by Phase 5 return flow)
--   • RPC: confirm_queue_claim — user confirms their offered turn
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Queue status enum ──────────────────────────────────────────────────────────
-- Tracks the lifecycle of a single queue entry.
-- 'waiting'   → user is actively queued; reserved_credits are soft-locked.
-- 'skipped'   → user did not confirm when their turn came; they re-join the bottom.
-- 'cancelled' → user voluntarily left the queue; credits released.

CREATE TYPE queue_status AS ENUM (
  'waiting',
  'skipped',
  'cancelled'
);

-- ── Queue table ────────────────────────────────────────────────────────────────
-- One row per queue entry. Users may have multiple rows per item over time
-- (original entry + re-inserts after skips), so unique constraints are partial
-- (see indexes below).

CREATE TABLE public.queue (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id               UUID         NOT NULL REFERENCES public.items(id)    ON DELETE CASCADE,
  user_id               UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 1-based; lower = closer to front. Only meaningful for status='waiting' rows.
  position              INT          NOT NULL CHECK (position >= 1),

  -- Lifecycle state for this entry.
  status                queue_status NOT NULL DEFAULT 'waiting',

  -- Soft-locked credits: the item's credit_value reserved at join time.
  -- Released (set to 0) on cancellation or skip.
  -- Converted to actual deduction when the user confirms their turn.
  reserved_credits      INT          NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),

  -- Set by advance_queue (Phase 5) when it is this user's turn.
  turn_offered_at       TIMESTAMPTZ,

  -- Set alongside turn_offered_at: turn_offered_at + 24h.
  -- If now() > confirmation_deadline the user has missed their turn.
  confirmation_deadline TIMESTAMPTZ,

  created_at            TIMESTAMPTZ  DEFAULT now()
);

-- ── Partial unique indexes ─────────────────────────────────────────────────────
-- Full UNIQUE constraints would block:
--   (a) re-inserting a user at the bottom after a skip (old row is now 'skipped')
--   (b) reassigning positions after a cancellation (cancelled row retains old position)
-- Partial indexes (WHERE status='waiting') restrict uniqueness to active entries only.

-- One active queue entry per user per item.
CREATE UNIQUE INDEX queue_item_user_waiting
  ON public.queue (item_id, user_id)
  WHERE (status = 'waiting');

-- No two active entries share a position on the same item.
CREATE UNIQUE INDEX queue_item_position_waiting
  ON public.queue (item_id, position)
  WHERE (status = 'waiting');

-- ── RLS on queue ───────────────────────────────────────────────────────────────

ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;

-- INSERT: users can only create entries for themselves.
CREATE POLICY "queue_insert_own"
  ON public.queue FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: all authenticated users can read all queue rows.
-- Needed to display queue length ("3 people waiting") and the viewer's position
-- to anyone viewing an item page, including non-queue members.
CREATE POLICY "queue_select_all"
  ON public.queue FOR SELECT
  TO authenticated
  USING (true);

-- UPDATE: users can only update their own rows.
-- Client-side updates are only used for status='cancelled' (cancel flow).
-- All other mutations go through SECURITY DEFINER RPCs.
CREATE POLICY "queue_update_own"
  ON public.queue FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy — clients set status='cancelled' instead of deleting.
-- This preserves the audit trail of queue history.

-- ── join_queue RPC ─────────────────────────────────────────────────────────────
-- Atomically validates eligibility and inserts a queue entry with soft-locked credits.
--
-- Spec §JOIN QUEUE OPERATION — must atomically:
--   1. Verify item is currently borrowed
--   2. Verify caller is not the owner
--   3. Verify caller has ≥1 uploaded item
--   4. Verify effective balance (balance − reserved) ≥ credit_value
--   5. Verify caller has no existing waiting entry for this item
--   6. Calculate next position (max waiting position + 1)
--   7. Insert queue row with reserved_credits = item's credit_value
--
-- Reason codes:
--   unauthorized          — auth.uid() != p_user_id
--   item_not_found        — item does not exist
--   item_not_borrowed     — item is not currently borrowed (wrong state for queue)
--   cannot_queue_own_item — user owns the item
--   not_eligible          — user has no uploaded items
--   already_in_queue      — user already has a waiting entry for this item
--   insufficient_credits  — effective balance < credit_value
--
-- Returns: { success: true, position: N } or { success: false, reason: string }

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
  -- ── Security: caller must be the user ────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Step 1: Lock item row (prevents race conditions on status/credit_value) ───
  SELECT id, owner_id, credit_value, status
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Step 2: Item must be borrowed — queue only exists for borrowed items ──────
  IF v_item.status != 'borrowed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_borrowed');
  END IF;

  -- ── Step 3: User cannot queue for their own item ──────────────────────────────
  IF v_item.owner_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_queue_own_item');
  END IF;

  -- ── Step 4: User must have at least one uploaded item ────────────────────────
  SELECT COUNT(*) INTO v_item_count
  FROM public.items
  WHERE owner_id = p_user_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- ── Step 5: Prevent duplicate waiting entry for same item ─────────────────────
  SELECT id INTO v_existing
  FROM public.queue
  WHERE item_id = p_item_id
    AND user_id = p_user_id
    AND status  = 'waiting';

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_in_queue');
  END IF;

  -- ── Step 6: Check effective credit balance ────────────────────────────────────
  -- Effective balance = credits.balance − sum of reserved_credits on ALL active
  -- (waiting) queue entries for this user across all items.
  -- This prevents a user from using the same credits for multiple queue entries.
  SELECT balance INTO v_user_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;  -- lock to prevent race with concurrent join_queue calls

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

  -- ── Step 7: Calculate next queue position ────────────────────────────────────
  -- Max position among existing waiting entries + 1. Defaults to 1 if queue empty.
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
  FROM public.queue
  WHERE item_id = p_item_id
    AND status  = 'waiting';

  -- ── Step 8: Insert queue entry with soft-locked credits ───────────────────────
  -- reserved_credits holds item's credit_value so the effective balance calculation
  -- elsewhere correctly excludes these credits from available spend.
  INSERT INTO public.queue (item_id, user_id, position, status, reserved_credits)
  VALUES (p_item_id, p_user_id, v_next_position, 'waiting', v_item.credit_value);

  RETURN jsonb_build_object('success', true, 'position', v_next_position);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_queue(UUID, UUID) TO authenticated;

-- ── cancel_queue RPC ───────────────────────────────────────────────────────────
-- Atomically cancels a user's active queue entry and reorders remaining positions.
--
-- Spec §CANCEL QUEUE OPERATION:
--   1. Set queue row status → 'cancelled'
--   2. Release reserved_credits (set to 0)
--   3. Reorder remaining waiting positions to fill the gap
--
-- Returns: { success: true } or { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.cancel_queue(
  p_item_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
BEGIN
  -- ── Security: caller must be the user ────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Find and lock the user's active waiting entry ─────────────────────────────
  SELECT id, position, reserved_credits
  INTO v_entry
  FROM public.queue
  WHERE item_id = p_item_id
    AND user_id = p_user_id
    AND status  = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_in_queue');
  END IF;

  -- ── Mark as cancelled and release the soft-lock ───────────────────────────────
  UPDATE public.queue
  SET status           = 'cancelled',
      reserved_credits = 0
  WHERE id = v_entry.id;

  -- ── Reorder remaining waiting entries to close the gap ───────────────────────
  -- All waiting entries positioned after the cancelled entry shift down by 1.
  -- This keeps positions contiguous (1, 2, 3, ...) for the queue_item_position_waiting
  -- partial unique index to remain valid after the cancelled entry is excluded.
  UPDATE public.queue
  SET position = position - 1
  WHERE item_id  = p_item_id
    AND status   = 'waiting'
    AND position > v_entry.position;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_queue(UUID, UUID) TO authenticated;

-- ── advance_queue RPC ──────────────────────────────────────────────────────────
-- Designed in Phase 4; triggered in Phase 5 when a borrow is returned.
--
-- Called after the current borrower's borrow is marked 'returned'.
-- Walks the waiting queue from position 1 upward, checking each user's
-- effective balance. The first eligible user is offered the item.
-- Users with insufficient credits are skipped and re-inserted at the bottom.
-- If the entire queue is exhausted without finding an eligible user,
-- the item is set back to 'available'.
--
-- Spec §QUEUE PROGRESSION LOGIC:
--   • find first waiting entry ordered by position
--   • check effective balance ≥ credit_value
--   • if yes  → set turn_offered_at, confirmation_deadline (+24h), stop
--   • if no   → status='skipped', reserved_credits=0, re-insert at bottom, continue
--   • if none → item.status = 'available'
--
-- NOT exposed to clients (no GRANT to authenticated).
-- Called only by the Phase 5 return RPC (SECURITY DEFINER chain).

CREATE OR REPLACE FUNCTION public.advance_queue(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item           RECORD;
  v_entry          RECORD;
  v_user_balance   INT;
  v_total_reserved INT;
  v_effective_bal  INT;
  v_next_position  INT;
  v_checked_ids    UUID[] := ARRAY[]::UUID[];  -- guard: track each user checked once
BEGIN
  -- ── Lock the item ─────────────────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Loop through queue from front to back ─────────────────────────────────────
  LOOP
    -- Find the waiting entry at the lowest active position
    SELECT id, user_id, position, reserved_credits,
           turn_offered_at, confirmation_deadline
    INTO v_entry
    FROM public.queue
    WHERE item_id = p_item_id
      AND status  = 'waiting'
    ORDER BY position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- No more waiting entries → set item back to available
    IF NOT FOUND THEN
      UPDATE public.items SET status = 'available' WHERE id = p_item_id;
      RETURN jsonb_build_object('success', true, 'result', 'queue_exhausted');
    END IF;

    -- Guard: if we have already evaluated this user_id in this call,
    -- the entire queue has been checked once without finding an eligible user.
    -- Set item to available and stop to prevent an infinite skip loop.
    IF v_entry.user_id = ANY(v_checked_ids) THEN
      UPDATE public.items SET status = 'available' WHERE id = p_item_id;
      RETURN jsonb_build_object('success', true, 'result', 'queue_exhausted_no_eligible');
    END IF;

    v_checked_ids := v_checked_ids || v_entry.user_id;

    -- ── Handle expired turn: user was offered but never confirmed ────────────────
    -- This can happen if advance_queue is called again after a deadline expired
    -- (e.g., Phase 5 receives a late return). Skip the user as if they declined.
    IF v_entry.turn_offered_at IS NOT NULL
       AND v_entry.confirmation_deadline IS NOT NULL
       AND now() > v_entry.confirmation_deadline THEN

      UPDATE public.queue
      SET status           = 'skipped',
          reserved_credits = 0
      WHERE id = v_entry.id;

      -- Compact positions: shift everyone above this entry down by 1
      UPDATE public.queue
      SET position = position - 1
      WHERE item_id  = p_item_id
        AND status   = 'waiting'
        AND position > v_entry.position;

      -- Re-insert this user at the bottom with reserved_credits=0
      -- (they had insufficient credits when the deadline expired or simply
      -- failed to act; a new check happens when their turn comes again)
      SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
      FROM public.queue
      WHERE item_id = p_item_id AND status = 'waiting';

      INSERT INTO public.queue (item_id, user_id, position, status, reserved_credits)
      VALUES (p_item_id, v_entry.user_id, v_next_position, 'waiting', 0);

      CONTINUE;
    END IF;

    -- ── Check this user's effective credit balance ────────────────────────────
    SELECT balance INTO v_user_balance
    FROM public.credits
    WHERE user_id = v_entry.user_id
    FOR UPDATE;

    -- Sum reserved_credits from all OTHER active queue entries for this user
    -- (credits locked for other items must not be double-counted)
    SELECT COALESCE(SUM(reserved_credits), 0) INTO v_total_reserved
    FROM public.queue
    WHERE user_id = v_entry.user_id
      AND status  = 'waiting'
      AND id     != v_entry.id;

    v_effective_bal := COALESCE(v_user_balance, 0) - v_total_reserved;

    IF v_effective_bal >= v_item.credit_value THEN
      -- ── Eligible: offer the turn ──────────────────────────────────────────────
      -- Set turn_offered_at and a 24-hour confirmation window.
      -- The UI will show a countdown; confirm_queue_claim must be called before deadline.
      -- reserved_credits is updated to reflect the current effective balance check.
      UPDATE public.queue
      SET turn_offered_at       = now(),
          confirmation_deadline = now() + INTERVAL '24 hours',
          reserved_credits      = v_item.credit_value  -- re-lock in case it was 0 (post-skip)
      WHERE id = v_entry.id;

      RETURN jsonb_build_object(
        'success',  true,
        'result',   'turn_offered',
        'user_id',  v_entry.user_id::text,
        'position', v_entry.position
      );

    ELSE
      -- ── Insufficient credits: skip this user ─────────────────────────────────
      -- Mark entry as skipped and release the soft-lock.
      UPDATE public.queue
      SET status           = 'skipped',
          reserved_credits = 0
      WHERE id = v_entry.id;

      -- Compact positions to fill the gap left by this entry.
      UPDATE public.queue
      SET position = position - 1
      WHERE item_id  = p_item_id
        AND status   = 'waiting'
        AND position > v_entry.position;

      -- Re-insert at the bottom so the user remains in the queue.
      -- reserved_credits = 0 because they currently cannot afford it;
      -- advance_queue will re-check when their turn comes around again.
      SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
      FROM public.queue
      WHERE item_id = p_item_id AND status = 'waiting';

      INSERT INTO public.queue (item_id, user_id, position, status, reserved_credits)
      VALUES (p_item_id, v_entry.user_id, v_next_position, 'waiting', 0);

      -- Continue loop: check the next user in line
    END IF;
  END LOOP;
END;
$$;

-- advance_queue is SECURITY DEFINER and called server-to-server by the Phase 5
-- return RPC. Not exposed to client-side calls.
-- GRANT EXECUTE ON FUNCTION public.advance_queue(UUID) TO authenticated;

-- ── confirm_queue_claim RPC ────────────────────────────────────────────────────
-- Called when a user taps "Claim Now" after advance_queue offers them the item.
--
-- Spec §QUEUE PROGRESSION LOGIC — if user confirms within the window:
--   • Convert reserved_credits to an actual deduction (credit_transaction: spent)
--   • Credit the item owner (credit_transaction: earned)
--   • Create a new borrow record
--   • Item stays 'borrowed' (a new active borrow begins)
--   • Release the soft-lock (reserved_credits → 0, turn timestamps cleared)
--
-- Reason codes:
--   unauthorized     — auth.uid() != p_user_id
--   item_not_found   — item does not exist
--   turn_not_offered — no waiting entry with turn_offered_at for this user/item
--   deadline_expired — confirmation_deadline has passed
--   insufficient_credits — balance fell below credit_value between offer and confirm
--
-- Returns: { success: true } or { success: false, reason: string }

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
  v_item  RECORD;
  v_entry RECORD;
  v_balance INT;
BEGIN
  -- ── Security ──────────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Lock item ─────────────────────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  -- ── Find the turn-offered queue entry ─────────────────────────────────────────
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

  -- ── Verify deadline has not passed ───────────────────────────────────────────
  IF now() > v_entry.confirmation_deadline THEN
    RETURN jsonb_build_object('success', false, 'reason', 'deadline_expired');
  END IF;

  -- ── Re-verify effective balance (may have changed since turn was offered) ─────
  SELECT balance INTO v_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_balance < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── All checks passed: execute the claim atomically ───────────────────────────

  -- Deduct credits from the borrower (converts soft-lock to real deduction)
  UPDATE public.credits
  SET balance    = balance - v_item.credit_value,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Record 'spent' transaction for the borrower
  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (p_user_id, -v_item.credit_value, 'spent', p_item_id);

  -- Create a new borrow record for this queue-based claim
  -- Phase 5 will set confirmed_at when the owner confirms handoff
  INSERT INTO public.borrows (item_id, borrower_id, status)
  VALUES (p_item_id, p_user_id, 'pending');

  -- Credit the item owner (they earn credits for the continued borrow)
  INSERT INTO public.credits (user_id, balance)
  VALUES (v_item.owner_id, v_item.credit_value)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = public.credits.balance + EXCLUDED.balance,
        updated_at = now();

  -- Record 'earned' transaction for the owner
  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (v_item.owner_id, v_item.credit_value, 'earned', p_item_id);

  -- Release the soft-lock and clear turn timestamps on the queue entry.
  -- The entry effectively represents a confirmed claim; its position is no longer
  -- relevant (Phase 5 will track the active borrow lifecycle separately).
  UPDATE public.queue
  SET reserved_credits      = 0,
      turn_offered_at       = NULL,
      confirmation_deadline = NULL
  WHERE id = v_entry.id;

  -- Item remains 'borrowed' — a new active borrow is now in progress

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_queue_claim(UUID, UUID) TO authenticated;
