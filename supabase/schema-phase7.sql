-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 7 Schema
-- Run in Supabase SQL Editor AFTER schema-phase6-patch1.sql (in order).
--
-- Adds:
--   • Enums:  damage_report_status, insurance_payment_status, chat_type
--   • Columns: profiles.is_admin, chats.chat_type
--   • Constraint change: chats.borrow_id unique → (borrow_id, chat_type) unique
--   • Tables: damage_reports, insurance_payments, reimbursements
--   • RLS on all new tables
--   • Updated RPC: claim_item   — creates insurance_payments row, returns borrow_id + insurance_amount
--   • New RPC:     pay_insurance — marks insurance as paid
--   • New RPC:     submit_damage_report — atomic: report + condition images + admin chat
--   • New RPC:     classify_repairable   — admin classifies damage as repairable
--   • New RPC:     classify_irreversible — admin classifies damage as irreversible (retires item, reimburses owner)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── New enums ──────────────────────────────────────────────────────────────────

CREATE TYPE public.damage_report_status AS ENUM (
  'submitted',
  'under_review',
  'repairable',
  'irreversible'
);

CREATE TYPE public.insurance_payment_status AS ENUM (
  'pending',
  'paid'
);

-- chat_type distinguishes handover coordination chats from admin support chats.
CREATE TYPE public.chat_type AS ENUM (
  'handover',  -- borrower ↔ owner (or prev borrower) for physical exchange coordination
  'admin'      -- borrower ↔ MirMari admin for damage report / support
);


-- ── Schema additions to existing tables ────────────────────────────────────────

-- Mark admin users in profiles. Set manually in the DB for staff accounts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Add chat_type to chats (default 'handover' keeps all existing chats correct).
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS chat_type public.chat_type NOT NULL DEFAULT 'handover';

-- Drop the existing UNIQUE(borrow_id) constraint so we can allow one handover
-- chat AND one admin chat per borrow (different chat_type values).
ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_borrow_id_key;

-- New constraint: (borrow_id, chat_type) must be unique.
-- This permits at most one handover and one admin chat per borrow.
ALTER TABLE public.chats
  ADD CONSTRAINT chats_borrow_id_chat_type_key UNIQUE (borrow_id, chat_type);


-- ── damage_reports ─────────────────────────────────────────────────────────────
-- Created by submit_damage_report RPC when a borrower reports physical damage.
-- Status progresses: submitted → under_review → repairable | irreversible.

CREATE TABLE public.damage_reports (
  id          UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_id   UUID                      NOT NULL REFERENCES public.borrows(id)   ON DELETE CASCADE,
  item_id     UUID                      NOT NULL REFERENCES public.items(id)     ON DELETE CASCADE,
  reporter_id UUID                      NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  description TEXT                      NOT NULL,
  status      public.damage_report_status NOT NULL DEFAULT 'submitted',
  admin_note  TEXT,
  created_at  TIMESTAMPTZ               DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

-- Borrower can read their own reports
CREATE POLICY "damage_reports_select_reporter"
  ON public.damage_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Item owner can read reports on their items
CREATE POLICY "damage_reports_select_owner"
  ON public.damage_reports FOR SELECT
  TO authenticated
  USING (
    item_id IN (
      SELECT id FROM public.items WHERE owner_id = auth.uid()
    )
  );

-- Admin can read all damage reports
CREATE POLICY "damage_reports_select_admin"
  ON public.damage_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admin can update (for status/admin_note via RPCs; also covers RPC SECURITY DEFINER which bypasses RLS)
CREATE POLICY "damage_reports_update_admin"
  ON public.damage_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Borrower INSERT: only for own reports (reporter_id must match caller)
CREATE POLICY "damage_reports_insert_reporter"
  ON public.damage_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());


-- ── insurance_payments ─────────────────────────────────────────────────────────
-- One row per borrow, created atomically inside claim_item.
-- Status transitions from 'pending' → 'paid' via pay_insurance RPC.
-- Borrow access to the chat is blocked until status = 'paid'.

CREATE TABLE public.insurance_payments (
  id          UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_id   UUID                          UNIQUE NOT NULL REFERENCES public.borrows(id) ON DELETE CASCADE,
  item_id     UUID                          NOT NULL REFERENCES public.items(id)           ON DELETE CASCADE,
  borrower_id UUID                          NOT NULL REFERENCES public.profiles(id)        ON DELETE CASCADE,
  amount_gel  NUMERIC(6,2)                  NOT NULL,
  paid_at     TIMESTAMPTZ,
  status      public.insurance_payment_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ                   DEFAULT now()
);

ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY;

-- Borrower can read their own insurance rows
CREATE POLICY "insurance_payments_select_borrower"
  ON public.insurance_payments FOR SELECT
  TO authenticated
  USING (borrower_id = auth.uid());

-- No client INSERT or UPDATE — managed entirely by RPCs (claim_item, pay_insurance).


-- ── reimbursements ─────────────────────────────────────────────────────────────
-- Created by classify_irreversible when an item is permanently retired.
-- Records how many credits the owner was reimbursed and why.

CREATE TABLE public.reimbursements (
  id                   UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id              UUID  NOT NULL REFERENCES public.items(id)          ON DELETE CASCADE,
  owner_id             UUID  NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  damage_report_id     UUID  NOT NULL REFERENCES public.damage_reports(id) ON DELETE CASCADE,
  -- Number of users who were in the waiting queue when the item was retired
  queue_snapshot       INT   NOT NULL,
  -- item.credit_value at the time of retirement (credit_value may change in future)
  credit_value_at_time INT   NOT NULL,
  -- total_credits = queue_snapshot × credit_value_at_time
  total_credits        INT   NOT NULL,
  issued_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;

-- Owner can read their own reimbursements
CREATE POLICY "reimbursements_select_owner"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Admin can read all reimbursements
CREATE POLICY "reimbursements_select_admin"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- No client INSERT or UPDATE — managed entirely by classify_irreversible RPC.


-- ── Helper: insurance amount from credit value ─────────────────────────────────
-- Used inside claim_item. Isolated for clarity.
-- Spec §INSURANCE SYSTEM: 5cr→1GEL, 8cr→2GEL, 10cr→3GEL.

CREATE OR REPLACE FUNCTION public.insurance_amount_for_credit_value(p_credit_value INT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_credit_value
    WHEN 5  THEN 1.00
    WHEN 8  THEN 2.00
    WHEN 10 THEN 3.00
    ELSE         1.00  -- fallback for unexpected credit values
  END;
$$;


-- ── Updated claim_item RPC ─────────────────────────────────────────────────────
-- All Phase 3/5/6 logic is unchanged.
-- Phase 7 additions:
--   • Calculates insurance_amount from item.credit_value.
--   • Creates insurance_payments row with status='pending' (payment required before chat access).
--   • Returns borrow_id and insurance_amount alongside chat_id.
--
-- After this RPC succeeds, the client navigates to /insurance/[borrow_id] for
-- the (mocked) payment step before being redirected to the chatroom.

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
  v_insurance_amount NUMERIC;
BEGIN
  -- ── Security ──────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Lock item ─────────────────────────────────────────────────────────────
  SELECT id, owner_id, credit_value, status, reclaiming
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_unavailable');
  END IF;

  IF v_item.status != 'available' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_unavailable');
  END IF;

  -- Phase 5: block if owner has initiated reclaim
  IF v_item.reclaiming THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_reclaiming');
  END IF;

  IF v_item.owner_id = p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_claim_own_item');
  END IF;

  -- ── Eligibility: borrower must have ≥1 uploaded item ─────────────────────
  SELECT COUNT(*) INTO v_item_count
  FROM public.items
  WHERE owner_id = p_borrower_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- ── Credit balance check ──────────────────────────────────────────────────
  SELECT balance INTO v_borrower_balance
  FROM public.credits
  WHERE user_id = p_borrower_id
  FOR UPDATE;

  IF NOT FOUND OR v_borrower_balance < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── All checks passed — execute atomically ────────────────────────────────

  UPDATE public.credits
  SET balance    = balance - v_item.credit_value,
      updated_at = now()
  WHERE user_id = p_borrower_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (p_borrower_id, -v_item.credit_value, 'spent', p_item_id);

  INSERT INTO public.borrows (item_id, borrower_id, status)
  VALUES (p_item_id, p_borrower_id, 'pending')
  RETURNING id INTO v_borrow_id;

  INSERT INTO public.credits (user_id, balance)
  VALUES (v_item.owner_id, v_item.credit_value)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = public.credits.balance + EXCLUDED.balance,
        updated_at = now();

  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (v_item.owner_id, v_item.credit_value, 'earned', p_item_id);

  UPDATE public.items SET status = 'borrowed' WHERE id = p_item_id;

  -- ── Phase 6: create chat + handover_confirmation + opening system message ──
  INSERT INTO public.chats (borrow_id, item_id, owner_id, borrower_id, chat_type)
  VALUES (v_borrow_id, p_item_id, v_item.owner_id, p_borrower_id, 'handover')
  RETURNING id INTO v_chat_id;

  INSERT INTO public.handover_confirmations (borrow_id)
  VALUES (v_borrow_id);

  INSERT INTO public.messages (chat_id, sender_id, content, is_system)
  VALUES (
    v_chat_id,
    p_borrower_id,
    'Chat with this person to arrange a meeting to hand over the clothing.',
    true
  );

  -- ── Phase 7: create insurance_payments row (pending until /insurance page) ─
  v_insurance_amount := public.insurance_amount_for_credit_value(v_item.credit_value);

  INSERT INTO public.insurance_payments (borrow_id, item_id, borrower_id, amount_gel, status)
  VALUES (v_borrow_id, p_item_id, p_borrower_id, v_insurance_amount, 'pending');

  -- Return borrow_id + chat_id + insurance_amount so the client can navigate to
  -- /insurance/[borrow_id] for the payment step before entering the chat.
  RETURN jsonb_build_object(
    'success',          true,
    'chat_id',          v_chat_id,
    'borrow_id',        v_borrow_id,
    'insurance_amount', v_insurance_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_item(UUID, UUID) TO authenticated;


-- ── pay_insurance RPC ──────────────────────────────────────────────────────────
-- Called when the borrower confirms the mocked insurance payment on /insurance/[borrowId].
-- Marks the insurance_payments row as 'paid' so the chat becomes accessible.
--
-- Returns: { success: true, chat_id: UUID } (so the page can navigate to the chat)
--          { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.pay_insurance(
  p_borrow_id   UUID,
  p_borrower_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_chat_id UUID;
BEGIN
  -- ── Security ──────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Fetch the pending insurance payment ───────────────────────────────────
  SELECT id, status
  INTO v_payment
  FROM public.insurance_payments
  WHERE borrow_id   = p_borrow_id
    AND borrower_id = p_borrower_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'payment_not_found');
  END IF;

  -- Idempotent: already paid is fine
  IF v_payment.status = 'paid' THEN
    SELECT id INTO v_chat_id
    FROM public.chats
    WHERE borrow_id = p_borrow_id AND chat_type = 'handover';
    RETURN jsonb_build_object('success', true, 'chat_id', v_chat_id);
  END IF;

  -- ── Mark as paid ──────────────────────────────────────────────────────────
  -- [ADDED: mock payment] No real payment processing. Status is flipped
  -- immediately on user confirmation — this simulates a payment gateway callback.
  UPDATE public.insurance_payments
  SET status  = 'paid',
      paid_at = now()
  WHERE id = v_payment.id;

  -- ── Return chat_id so the client can navigate directly ────────────────────
  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE borrow_id = p_borrow_id AND chat_type = 'handover';

  RETURN jsonb_build_object('success', true, 'chat_id', v_chat_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_insurance(UUID, UUID) TO authenticated;


-- ── submit_damage_report RPC ───────────────────────────────────────────────────
-- Atomically creates everything needed for a damage report:
--   1. damage_reports row (status: submitted)
--   2. item_images rows with layer='condition' for each uploaded image URL
--      (images are pre-uploaded to storage by the client before calling this RPC)
--   3. admin chat (chat_type: admin) between the borrower and the first admin user
--   4. opening system message in the admin chat
--
-- Requires borrow.status = 'active' (handover confirmed before damage can be reported).
--
-- Parameters:
--   p_borrow_id   — the active borrow being reported
--   p_reporter_id — must equal auth.uid() and borrow.borrower_id
--   p_description — damage description text (required, non-empty)
--   p_image_urls  — array of public storage URLs (client uploads to storage first)
--
-- Returns: { success: true, admin_chat_id: UUID }
--          { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.submit_damage_report(
  p_borrow_id   UUID,
  p_reporter_id UUID,
  p_description TEXT,
  p_image_urls  TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_borrow      RECORD;
  v_admin_id    UUID;
  v_report_id   UUID;
  v_chat_id     UUID;
  v_img_url     TEXT;
BEGIN
  -- ── Security ──────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_reporter_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  IF p_description IS NULL OR trim(p_description) = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'description_required');
  END IF;

  IF p_image_urls IS NULL OR array_length(p_image_urls, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'images_required');
  END IF;

  -- ── Verify active borrow ──────────────────────────────────────────────────
  SELECT id, item_id, borrower_id, status
  INTO v_borrow
  FROM public.borrows
  WHERE id = p_borrow_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'borrow_not_found');
  END IF;

  IF v_borrow.borrower_id != p_reporter_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_borrower');
  END IF;

  -- Damage reports require an active (post-handover) borrow
  IF v_borrow.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'borrow_not_active');
  END IF;

  -- ── Insert damage_reports row ─────────────────────────────────────────────
  INSERT INTO public.damage_reports (borrow_id, item_id, reporter_id, description, status)
  VALUES (p_borrow_id, v_borrow.item_id, p_reporter_id, trim(p_description), 'submitted')
  RETURNING id INTO v_report_id;

  -- ── Insert item_images rows with layer='condition' ────────────────────────
  -- These images document the item's condition at the time of the report.
  -- owner_id = reporter (borrower who uploaded them via the report form).
  FOREACH v_img_url IN ARRAY p_image_urls
  LOOP
    INSERT INTO public.item_images (item_id, owner_id, url, layer, is_forward)
    VALUES (v_borrow.item_id, p_reporter_id, v_img_url, 'condition', false);
  END LOOP;

  -- ── Find admin user for the support chat ─────────────────────────────────
  SELECT id INTO v_admin_id
  FROM public.profiles
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Report and condition images still created even if no admin exists yet.
    -- Admin chat is skipped; admin will need to be set up in the DB.
    RETURN jsonb_build_object(
      'success',        true,
      'admin_chat_id',  NULL,
      'report_id',      v_report_id
    );
  END IF;

  -- ── Create admin chat ─────────────────────────────────────────────────────
  -- owner_id = admin (the MirMari support agent)
  -- borrower_id = reporter (the borrower who filed the report)
  -- chat_type = 'admin' so it's distinct from the handover chat
  INSERT INTO public.chats (borrow_id, item_id, owner_id, borrower_id, chat_type)
  VALUES (p_borrow_id, v_borrow.item_id, v_admin_id, p_reporter_id, 'admin')
  RETURNING id INTO v_chat_id;

  -- ── Opening system message ────────────────────────────────────────────────
  INSERT INTO public.messages (chat_id, sender_id, content, is_system)
  VALUES (
    v_chat_id,
    p_reporter_id,
    'Damage report submitted. MirMari admin will review and respond shortly.',
    true
  );

  RETURN jsonb_build_object('success', true, 'admin_chat_id', v_chat_id, 'report_id', v_report_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_damage_report(UUID, UUID, TEXT, TEXT[]) TO authenticated;


-- ── classify_repairable RPC ────────────────────────────────────────────────────
-- Admin classifies a damage report as repairable.
-- No change to item circulation — the item continues normally.
-- Inserts a system message in the admin chat to inform the borrower.
--
-- Returns: { success: true } | { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.classify_repairable(
  p_report_id UUID,
  p_admin_id  UUID,
  p_note      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report  RECORD;
  v_chat_id UUID;
BEGIN
  -- ── Verify admin ──────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_admin_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_admin');
  END IF;

  -- ── Fetch damage report ────────────────────────────────────────────────────
  SELECT id, borrow_id, status
  INTO v_report
  FROM public.damage_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'report_not_found');
  END IF;

  -- ── Update report status ───────────────────────────────────────────────────
  UPDATE public.damage_reports
  SET status      = 'repairable',
      admin_note  = p_note,
      resolved_at = now()
  WHERE id = v_report.id;

  -- ── Insert system message in the admin chat ────────────────────────────────
  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE borrow_id = v_report.borrow_id
    AND chat_type  = 'admin';

  IF FOUND THEN
    INSERT INTO public.messages (chat_id, sender_id, content, is_system)
    VALUES (
      v_chat_id,
      p_admin_id,
      'Admin has classified this damage as repairable. The item will continue circulating after repair.',
      true
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_repairable(UUID, UUID, TEXT) TO authenticated;


-- ── classify_irreversible RPC ──────────────────────────────────────────────────
-- Admin classifies a damage report as irreversible (item permanently retired).
-- Atomically:
--   1. Sets damage_reports.status = irreversible
--   2. Sets item.status = unavailable, item.reclaiming = false
--   3. Cancels all waiting queue entries and releases soft-locked credits
--   4. Calculates reimbursement = queue_snapshot × credit_value
--   5. Creates reimbursements row
--   6. Credits owner's balance (type: reimbursed)
--   7. Inserts system message in admin chat
--
-- Returns: { success: true } | { success: false, reason: string }

CREATE OR REPLACE FUNCTION public.classify_irreversible(
  p_report_id UUID,
  p_admin_id  UUID,
  p_note      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report        RECORD;
  v_item          RECORD;
  v_queue_snapshot INT;
  v_total_credits  INT;
  v_chat_id        UUID;
BEGIN
  -- ── Verify admin ──────────────────────────────────────────────────────────
  IF auth.uid() IS NULL OR auth.uid() != p_admin_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_admin');
  END IF;

  -- ── Fetch damage report ────────────────────────────────────────────────────
  SELECT id, borrow_id, item_id, status
  INTO v_report
  FROM public.damage_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'report_not_found');
  END IF;

  -- ── Fetch and lock item ────────────────────────────────────────────────────
  SELECT id, owner_id, credit_value
  INTO v_item
  FROM public.items
  WHERE id = v_report.item_id
  FOR UPDATE;

  -- ── Update report status ───────────────────────────────────────────────────
  UPDATE public.damage_reports
  SET status      = 'irreversible',
      admin_note  = p_note,
      resolved_at = now()
  WHERE id = v_report.id;

  -- ── Retire the item ────────────────────────────────────────────────────────
  UPDATE public.items
  SET status     = 'unavailable',
      reclaiming = false
  WHERE id = v_item.id;

  -- ── Count and cancel all waiting queue entries ────────────────────────────
  -- Soft-locked credits (reserved_credits) are released by setting them to 0.
  -- credits.balance was never actually reduced for queue entries (soft-lock only),
  -- so no credit refund is needed — cancelling the entry is sufficient.
  SELECT COUNT(*) INTO v_queue_snapshot
  FROM public.queue
  WHERE item_id = v_item.id AND status = 'waiting';

  UPDATE public.queue
  SET status           = 'cancelled',
      reserved_credits = 0
  WHERE item_id = v_item.id AND status = 'waiting';

  -- ── Reimbursement: owner compensated for lost future earnings ─────────────
  -- total_credits = people_in_queue × credit_value (one borrow cycle per waiter)
  v_total_credits := v_queue_snapshot * v_item.credit_value;

  INSERT INTO public.reimbursements (
    item_id, owner_id, damage_report_id,
    queue_snapshot, credit_value_at_time, total_credits, issued_at
  )
  VALUES (
    v_item.id, v_item.owner_id, v_report.id,
    v_queue_snapshot, v_item.credit_value, v_total_credits, now()
  );

  -- Credit owner (even if total_credits = 0, record is created for audit)
  IF v_total_credits > 0 THEN
    INSERT INTO public.credits (user_id, balance)
    VALUES (v_item.owner_id, v_total_credits)
    ON CONFLICT (user_id) DO UPDATE
      SET balance    = public.credits.balance + EXCLUDED.balance,
          updated_at = now();

    INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
    VALUES (v_item.owner_id, v_total_credits, 'reimbursed', v_item.id);
  END IF;

  -- ── System message in admin chat ──────────────────────────────────────────
  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE borrow_id = v_report.borrow_id
    AND chat_type  = 'admin';

  IF FOUND THEN
    INSERT INTO public.messages (chat_id, sender_id, content, is_system)
    VALUES (
      v_chat_id,
      p_admin_id,
      'Admin has classified this damage as irreversible. The item has been retired. Reimbursement has been issued to the owner.',
      true
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_irreversible(UUID, UUID, TEXT) TO authenticated;
