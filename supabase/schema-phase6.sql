-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 6 Schema
-- Run in Supabase SQL Editor AFTER all previous phase schemas (in order).
--
-- Adds:
--   • Table: chats           — one per borrow, connects borrower ↔ owner
--   • Table: messages        — chat messages (user + system)
--   • Table: handover_confirmations — tracks physical handover confirmation
--   • RLS policies for all new tables
--   • Updated RPC: claim_item  — atomically creates chat + confirmation + system msg
--   • RPC: ensure_handover_prompt — inserts "Has it been handed over?" system msg
--   • RPC: confirm_handover   — atomic dual-confirmation + borrow status transition
--   • RPC: get_unread_count   — returns unread message count for current user
--   • Realtime publication for messages table
-- ─────────────────────────────────────────────────────────────────────────────

-- ── chats table ───────────────────────────────────────────────────────────────
-- One chat per borrow (unique constraint on borrow_id).
-- Created automatically inside claim_item when a borrow is successfully recorded.
-- Participants are always the item owner and the borrower — immutable after creation.
-- last_read_at columns track when each side last viewed the chat;
-- used to compute the unread message count badge in BottomNav.

CREATE TABLE public.chats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_id       UUID        UNIQUE NOT NULL REFERENCES public.borrows(id) ON DELETE CASCADE,
  item_id         UUID        NOT NULL REFERENCES public.items(id)    ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  borrower_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Updated client-side when either participant opens the chat.
  owner_last_read_at    TIMESTAMPTZ,
  borrower_last_read_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── messages table ────────────────────────────────────────────────────────────
-- Append-only chat history. User messages (is_system=false) are inserted by
-- authenticated clients via RLS. System messages (is_system=true) are inserted
-- only by SECURITY DEFINER RPCs (claim_item, ensure_handover_prompt,
-- confirm_handover) and are not writable by clients.

CREATE TABLE public.messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID        NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  -- is_system = true: automated messages from the platform (centered, muted style).
  -- is_system = false: user-generated messages (left/right alignment by sender).
  is_system  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Postgres realtime change events so ChatInterface can subscribe
-- to new message inserts without polling.
-- Note: in Supabase Dashboard → Database → Replication, the messages table
-- must also be toggled on for the supabase_realtime publication.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ── handover_confirmations table ──────────────────────────────────────────────
-- Tracks whether both parties have confirmed the physical item exchange.
-- One row per borrow, created inside claim_item alongside the chat row.
-- fully_confirmed_at being set means the handover is complete;
-- this triggers borrows.status → 'active' via confirm_handover.

CREATE TABLE public.handover_confirmations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_id             UUID        UNIQUE NOT NULL REFERENCES public.borrows(id) ON DELETE CASCADE,
  -- Each side confirms independently; UI shows their own button until confirmed.
  confirmed_by_borrower BOOLEAN     NOT NULL DEFAULT false,
  confirmed_by_owner    BOOLEAN     NOT NULL DEFAULT false,
  borrower_confirmed_at TIMESTAMPTZ,
  owner_confirmed_at    TIMESTAMPTZ,
  -- Set when both sides confirm; triggers borrow activation.
  fully_confirmed_at    TIMESTAMPTZ
);

-- ── RLS: chats ────────────────────────────────────────────────────────────────

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Only the two participants can read their chat.
CREATE POLICY "chats_select_participants"
  ON public.chats FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR borrower_id = auth.uid());

-- No client INSERT — chats are created by the claim_item RPC (SECURITY DEFINER).

-- Participants can update last_read_at fields (unread tracking).
-- Both can UPDATE the row; client code only updates the field that matches their role.
CREATE POLICY "chats_update_participants"
  ON public.chats FOR UPDATE
  TO authenticated
  USING  (owner_id = auth.uid() OR borrower_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR borrower_id = auth.uid());

-- ── RLS: messages ─────────────────────────────────────────────────────────────

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Participants in a chat can read all its messages, including system messages.
CREATE POLICY "messages_select_chat_participants"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    chat_id IN (
      SELECT id FROM public.chats
      WHERE owner_id = auth.uid() OR borrower_id = auth.uid()
    )
  );

-- Participants can send non-system messages as themselves.
-- is_system = true messages can only be inserted by SECURITY DEFINER RPCs.
CREATE POLICY "messages_insert_chat_participants"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id  = auth.uid()
    AND is_system = false
    AND chat_id IN (
      SELECT id FROM public.chats
      WHERE owner_id = auth.uid() OR borrower_id = auth.uid()
    )
  );

-- ── RLS: handover_confirmations ───────────────────────────────────────────────

ALTER TABLE public.handover_confirmations ENABLE ROW LEVEL SECURITY;

-- Participants can read the confirmation state for their borrow.
CREATE POLICY "handover_confirmations_select_participants"
  ON public.handover_confirmations FOR SELECT
  TO authenticated
  USING (
    borrow_id IN (
      SELECT id FROM public.borrows
      WHERE borrower_id = auth.uid()
         OR item_id IN (SELECT id FROM public.items WHERE owner_id = auth.uid())
    )
  );

-- No client INSERT or UPDATE — entirely managed by confirm_handover RPC.

-- ── Updated claim_item RPC ─────────────────────────────────────────────────────
-- Phase 6 changes (on top of Phase 5 version):
--   • After recording the borrow, atomically creates:
--       1. A chats row linking borrower and owner for this borrow
--       2. A handover_confirmations row for dual-confirmation tracking
--       3. A system message: "Chat with this person to arrange a meeting..."
--   • Returns { success: true, chat_id: UUID } so the UI can navigate to the chat.
--
-- All previous checks (reclaiming, availability, eligibility, credits) are unchanged.

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
  v_borrow_id        UUID;
  v_chat_id          UUID;
BEGIN
  -- ── Security ──────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Step 1: Lock item ─────────────────────────────────────────────────────
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

  -- ── Step 2b (Phase 5): Reject if reclaiming ───────────────────────────────
  IF v_item.reclaiming THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_reclaiming');
  END IF;

  -- ── Step 3: Cannot claim own item ─────────────────────────────────────────
  IF v_item.owner_id = p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_claim_own_item');
  END IF;

  -- ── Step 4: Must have ≥1 uploaded item ────────────────────────────────────
  SELECT COUNT(*) INTO v_item_count
  FROM public.items
  WHERE owner_id = p_borrower_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- ── Step 5: Check credit balance ─────────────────────────────────────────
  SELECT balance INTO v_borrower_balance
  FROM public.credits
  WHERE user_id = p_borrower_id
  FOR UPDATE;

  IF NOT FOUND OR v_borrower_balance < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── All checks passed — execute atomically ────────────────────────────────

  -- Deduct borrower credits
  UPDATE public.credits
  SET balance    = balance - v_item.credit_value,
      updated_at = now()
  WHERE user_id = p_borrower_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (p_borrower_id, -v_item.credit_value, 'spent', p_item_id);

  -- Create borrow record and capture its ID for chat creation
  INSERT INTO public.borrows (item_id, borrower_id, status)
  VALUES (p_item_id, p_borrower_id, 'pending')
  RETURNING id INTO v_borrow_id;

  -- Credit owner
  INSERT INTO public.credits (user_id, balance)
  VALUES (v_item.owner_id, v_item.credit_value)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = public.credits.balance + EXCLUDED.balance,
        updated_at = now();

  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (v_item.owner_id, v_item.credit_value, 'earned', p_item_id);

  -- Mark item as borrowed
  UPDATE public.items SET status = 'borrowed' WHERE id = p_item_id;

  -- ── Phase 6: Create chat + handover_confirmation + opening system message ──

  -- Chat: links the borrow to both participants for coordination
  INSERT INTO public.chats (borrow_id, item_id, owner_id, borrower_id)
  VALUES (v_borrow_id, p_item_id, v_item.owner_id, p_borrower_id)
  RETURNING id INTO v_chat_id;

  -- Handover confirmation: tracks dual-side physical exchange confirmation
  INSERT INTO public.handover_confirmations (borrow_id)
  VALUES (v_borrow_id);

  -- System message: opening instruction for the chat
  -- is_system = true bypasses the RLS policy (this RPC is SECURITY DEFINER)
  INSERT INTO public.messages (chat_id, sender_id, content, is_system)
  VALUES (
    v_chat_id,
    p_borrower_id,  -- sender_id for system messages is the triggering user; display ignores it
    'Chat with this person to arrange a meeting to hand over the clothing.',
    true
  );

  -- Return chat_id so the client can navigate directly to the new chat
  RETURN jsonb_build_object('success', true, 'chat_id', v_chat_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_item(UUID, UUID) TO authenticated;

-- ── ensure_handover_prompt RPC ─────────────────────────────────────────────────
-- Inserts the "Has the item been handed over?" system message into a chat,
-- but only if:
--   • The caller is a participant (owner or borrower)
--   • At least 2 hours have elapsed since chat creation
--   • No previous handover prompt system message exists for this chat
--   • The handover is not yet fully confirmed
--
-- Called from the chat page server component on each load when conditions are met.
-- Idempotent: repeated calls after the first insertion return 'noop'.
--
-- Spec §CHAT INTERFACE: "After the chat opens, the system inserts an automated
-- message 2 hours after chat creation: 'Has the item been handed over?'"

CREATE OR REPLACE FUNCTION public.ensure_handover_prompt(
  p_chat_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat   RECORD;
  v_hc     RECORD;
  v_exists BOOLEAN;
BEGIN
  -- ── Fetch and verify chat ─────────────────────────────────────────────────
  SELECT id, owner_id, borrower_id, borrow_id, created_at
  INTO v_chat
  FROM public.chats
  WHERE id = p_chat_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'chat_not_found');
  END IF;

  -- ── Verify caller is a participant ─────────────────────────────────────────
  IF auth.uid() != v_chat.owner_id AND auth.uid() != v_chat.borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Check 2-hour window ───────────────────────────────────────────────────
  IF v_chat.created_at + INTERVAL '2 hours' > now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'too_early');
  END IF;

  -- ── Check if handover is already fully confirmed ──────────────────────────
  SELECT fully_confirmed_at IS NOT NULL INTO v_exists
  FROM public.handover_confirmations
  WHERE borrow_id = v_chat.borrow_id;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_confirmed');
  END IF;

  -- ── Check if prompt message already exists (idempotency guard) ────────────
  SELECT EXISTS(
    SELECT 1 FROM public.messages
    WHERE chat_id   = p_chat_id
      AND is_system = true
      AND content LIKE 'Has the item been handed over?%'
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('success', true, 'result', 'noop');
  END IF;

  -- ── Insert the handover prompt system message ─────────────────────────────
  INSERT INTO public.messages (chat_id, sender_id, content, is_system)
  VALUES (
    p_chat_id,
    auth.uid(),  -- triggering participant; display ignores sender for system messages
    'Has the item been handed over? Please confirm below.',
    true
  );

  RETURN jsonb_build_object('success', true, 'result', 'inserted');
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_handover_prompt(UUID) TO authenticated;

-- ── confirm_handover RPC ───────────────────────────────────────────────────────
-- Records one side of the handover confirmation.
-- When both sides confirm, atomically:
--   • Sets handover_confirmations.fully_confirmed_at
--   • Updates borrows.status → 'active', borrows.confirmed_at → now()
--   • Inserts final system message: "Handover confirmed. Enjoy your borrow!"
--
-- Spec §HANDOVER CONFIRMATION.
--
-- Parameters:
--   p_borrow_id — the borrow this confirmation belongs to
--   p_user_id   — the caller (verified against borrow record)
--   p_role      — 'borrower' or 'owner' (verified against borrow FK)
--
-- Returns:
--   { success: true, result: 'partial_confirmed' } — one side confirmed
--   { success: true, result: 'fully_confirmed' }   — both sides confirmed, borrow active
--   { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.confirm_handover(
  p_borrow_id UUID,
  p_user_id   UUID,
  p_role      TEXT   -- 'borrower' or 'owner'
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
  -- ── Security: caller must match p_user_id ─────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Validate role parameter ────────────────────────────────────────────────
  IF p_role NOT IN ('borrower', 'owner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_role');
  END IF;

  -- ── Fetch and lock borrow ─────────────────────────────────────────────────
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
    -- Verify the caller owns the item (not stored directly on borrows)
    IF NOT EXISTS (
      SELECT 1 FROM public.items
      WHERE id = v_borrow.item_id AND owner_id = p_user_id
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

  -- ── Already fully confirmed ───────────────────────────────────────────────
  IF v_hc.fully_confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'result', 'already_fully_confirmed');
  END IF;

  -- ── Record this side's confirmation ───────────────────────────────────────
  IF p_role = 'borrower' AND NOT v_hc.confirmed_by_borrower THEN
    UPDATE public.handover_confirmations
    SET confirmed_by_borrower   = true,
        borrower_confirmed_at   = now()
    WHERE id = v_hc.id;
    v_hc.confirmed_by_borrower := true;
  ELSIF p_role = 'owner' AND NOT v_hc.confirmed_by_owner THEN
    UPDATE public.handover_confirmations
    SET confirmed_by_owner   = true,
        owner_confirmed_at   = now()
    WHERE id = v_hc.id;
    v_hc.confirmed_by_owner := true;
  END IF;

  -- ── Check if both sides are now confirmed ─────────────────────────────────
  IF v_hc.confirmed_by_borrower AND v_hc.confirmed_by_owner THEN
    -- ── Full confirmation: execute all state transitions atomically ────────

    -- Set fully_confirmed_at on handover_confirmation
    UPDATE public.handover_confirmations
    SET fully_confirmed_at = now()
    WHERE id = v_hc.id;

    -- Transition borrow to 'active' (spec §HANDOVER CONFIRMATION)
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

  -- Only one side confirmed so far
  RETURN jsonb_build_object('success', true, 'result', 'partial_confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_handover(UUID, UUID, TEXT) TO authenticated;

-- ── get_unread_count RPC ───────────────────────────────────────────────────────
-- Returns the total number of unread messages for the calling user across all chats.
--
-- Unread = messages where:
--   • sender is not the current user
--   • is_system = false (system messages are not counted as "unread")
--   • created_at > last_read_at for that chat (for the current user's role)
--   • last_read_at NULL = never read = all non-own messages are unread
--
-- Used by BottomNav to show the badge count on the Chats tab.

CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS INT
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.messages m
  JOIN public.chats c ON c.id = m.chat_id
  WHERE m.sender_id != auth.uid()
    AND m.is_system  = false
    AND (
      -- Current user is owner: compare against owner_last_read_at
      (c.owner_id    = auth.uid()
        AND (c.owner_last_read_at    IS NULL OR m.created_at > c.owner_last_read_at))
      OR
      -- Current user is borrower: compare against borrower_last_read_at
      (c.borrower_id = auth.uid()
        AND (c.borrower_last_read_at IS NULL OR m.created_at > c.borrower_last_read_at))
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_count() TO authenticated;
