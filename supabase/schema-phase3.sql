-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 3 Schema
-- Run in Supabase SQL Editor AFTER schema.sql (Phase 1) and schema-phase2.sql (Phase 2).
--
-- Adds:
--   • profiles RLS fix: allow all authenticated users to read any profile
--   • Enums: credit_transaction_type, borrow_status
--   • Table: credits (one row per user, tracks balance)
--   • Table: credit_transactions (audit trail of all credit movements)
--   • Table: borrows (borrow requests and their lifecycle)
--   • Trigger: auto-create credits row on profile insert (10 credit starting balance)
--   • Migration: back-fill credits for existing Phase 1/2 users
--   • RLS policies for all new tables
--   • Atomic claim_item RPC (SECURITY DEFINER — multi-user operation)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Fix: profiles readable by all authenticated users ────────────────────────
-- Phase 1 only allowed users to read their OWN profile row. Phase 3 introduces
-- public profile pages (/profile/[id]) and the district join in browse feed,
-- both of which require reading other users' profiles.
-- Supabase applies OR between policies: a row is visible if ANY policy allows it.
CREATE POLICY "profiles_select_all_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- ── Enums ────────────────────────────────────────────────────────────────────

-- Types of credit movements. 'reimbursed' is reserved for Phase 4 (return flow).
CREATE TYPE credit_transaction_type AS ENUM (
  'earned',       -- owner receives credits when their item is borrowed
  'spent',        -- borrower pays credits to claim an item
  'purchased',    -- user buys credits (mock payment in Phase 3)
  'reimbursed'    -- reserved: Phase 4 return flow
);

-- Lifecycle states for a borrow request.
-- 'active' and 'returned' transitions are Phase 4.
CREATE TYPE borrow_status AS ENUM (
  'pending',   -- claim submitted, waiting for owner confirmation
  'active',    -- owner confirmed, item is with borrower
  'returned'   -- item returned to owner
);

-- ── Credits table ─────────────────────────────────────────────────────────────
-- One row per user. Updated atomically by the claim_item RPC and mock purchase.

CREATE TABLE public.credits (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance    INT         NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: create a credits row with 10 starting credits when a profile is created.
-- Spec §DATABASE: "every new user gets 10 credits".
-- SECURITY DEFINER: trigger runs under function-owner privileges (bypasses RLS).
-- Required because credits has RLS enabled with no INSERT policy for authenticated
-- users — the trigger must bypass RLS to insert the initial credits row.
CREATE OR REPLACE FUNCTION public.create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER profiles_create_credits
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_credits();

-- Migration: back-fill credits rows for Phase 1/2 users who already have profiles
-- but no credits row (the trigger only fires for new inserts).
INSERT INTO public.credits (user_id, balance)
SELECT id, 10
FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.credits)
ON CONFLICT DO NOTHING;

-- ── Credit transactions table ─────────────────────────────────────────────────
-- Append-only audit log of every credit movement. Never updated in place.

CREATE TABLE public.credit_transactions (
  id         UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID                    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     INT                     NOT NULL,   -- positive = in, negative = out
  type       credit_transaction_type NOT NULL,
  item_id    UUID                    REFERENCES public.items(id) ON DELETE SET NULL,  -- nullable
  created_at TIMESTAMPTZ             DEFAULT now()
);

-- ── Borrows table ─────────────────────────────────────────────────────────────
-- Tracks each borrow request from initial claim to return.

CREATE TABLE public.borrows (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID          NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  borrower_id  UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       borrow_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ   DEFAULT now(),
  confirmed_at TIMESTAMPTZ,  -- Phase 4: set when owner confirms handoff
  returned_at  TIMESTAMPTZ   -- Phase 4: set when item is returned
);

-- ── RLS: credits ──────────────────────────────────────────────────────────────

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

-- Users can only read their own balance. Balance is private.
CREATE POLICY "credits_select_own"
  ON public.credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- [ADDED: mock payment] Direct client updates to own credits row.
-- Used by /credits page mock purchase (spec §CREDIT SYSTEM: "payment is mocked").
-- Phase 4: replace with a server-side RPC triggered after real payment verification.
CREATE POLICY "credits_update_own"
  ON public.credits FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── RLS: credit_transactions ──────────────────────────────────────────────────

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read only their own transaction history.
CREATE POLICY "credit_transactions_select_own"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Client can insert 'purchased' transactions (mock payment flow).
-- 'earned' and 'spent' transactions are inserted via the claim_item RPC.
CREATE POLICY "credit_transactions_insert_own"
  ON public.credit_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── RLS: borrows ──────────────────────────────────────────────────────────────

ALTER TABLE public.borrows ENABLE ROW LEVEL SECURITY;

-- Borrower can create a borrow request for themselves only.
CREATE POLICY "borrows_insert_own"
  ON public.borrows FOR INSERT
  TO authenticated
  WITH CHECK (borrower_id = auth.uid());

-- Visibility rules (spec §RLS ON NEW TABLES):
--   • Borrower sees their own borrow records
--   • Item owner sees all borrows on their items (for management)
--   • Returned borrows are public history (spec §ITEM PROFILE PAGE: "show past borrowers")
CREATE POLICY "borrows_select"
  ON public.borrows FOR SELECT
  TO authenticated
  USING (
    borrower_id = auth.uid()
    OR item_id IN (SELECT id FROM public.items WHERE owner_id = auth.uid())
    OR status = 'returned'
  );

-- ── Atomic claim RPC ──────────────────────────────────────────────────────────
-- All claim logic runs in a single DB transaction.
-- SECURITY DEFINER: runs as the function owner (bypasses RLS) so it can update
-- both the borrower's and owner's credits rows, which would be blocked by RLS.
-- The auth.uid() check inside prevents any user from calling this on behalf of another.
--
-- Spec §ATOMIC CLAIM OPERATION: must verify → deduct → credit → record → update item.
--
-- Return values (spec §RPC RETURN VALUE):
--   { success: true }
--   { success: false, reason: 'item_unavailable' }
--   { success: false, reason: 'cannot_claim_own_item' }
--   { success: false, reason: 'not_eligible' }
--   { success: false, reason: 'insufficient_credits' }

CREATE OR REPLACE FUNCTION public.claim_item(
  p_item_id     UUID,
  p_borrower_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- prevent search_path injection
AS $$
DECLARE
  v_item             RECORD;
  v_borrower_balance INT;
  v_item_count       INT;
BEGIN
  -- ── Security: caller must be the borrower ─────────────────────────────────
  -- Prevents a user from calling claim_item(item, someone_else_id).
  IF auth.uid() IS NULL OR auth.uid() != p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  -- ── Step 1: Lock item row (prevents concurrent claims on same item) ────────
  SELECT id, owner_id, credit_value, status
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

  -- ── Step 3: Borrower cannot claim their own item ──────────────────────────
  IF v_item.owner_id = p_borrower_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_claim_own_item');
  END IF;

  -- ── Step 4: Borrower must have at least one uploaded item (spec §CLAIM FLOW)
  SELECT COUNT(*) INTO v_item_count
  FROM public.items
  WHERE owner_id = p_borrower_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- ── Step 5: Check and lock borrower's credit balance ──────────────────────
  SELECT balance INTO v_borrower_balance
  FROM public.credits
  WHERE user_id = p_borrower_id
  FOR UPDATE;

  -- No credits row or insufficient balance → reject
  IF NOT FOUND OR v_borrower_balance < v_item.credit_value THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_credits');
  END IF;

  -- ── All checks passed — execute atomically ────────────────────────────────

  -- Step 6: Deduct credits from borrower
  UPDATE public.credits
  SET balance    = balance - v_item.credit_value,
      updated_at = now()
  WHERE user_id = p_borrower_id;

  -- Step 7: Record deduction transaction for borrower (type: spent, negative amount)
  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (p_borrower_id, -v_item.credit_value, 'spent', p_item_id);

  -- Step 8: Create borrow record (status: pending — owner confirmation is Phase 4)
  INSERT INTO public.borrows (item_id, borrower_id, status)
  VALUES (p_item_id, p_borrower_id, 'pending');

  -- Step 9: Credit the item owner
  -- UPSERT handles both existing credits rows and missing ones (edge case for
  -- owners who joined before Phase 3 and were missed by the back-fill migration).
  INSERT INTO public.credits (user_id, balance)
  VALUES (v_item.owner_id, v_item.credit_value)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = public.credits.balance + EXCLUDED.balance,
        updated_at = now();

  -- Step 10: Record earning transaction for owner (type: earned, positive amount)
  INSERT INTO public.credit_transactions (user_id, amount, type, item_id)
  VALUES (v_item.owner_id, v_item.credit_value, 'earned', p_item_id);

  -- Step 11: Mark item as borrowed — prevents concurrent claims
  UPDATE public.items
  SET status = 'borrowed'
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permission to authenticated users via PostgREST
GRANT EXECUTE ON FUNCTION public.claim_item(UUID, UUID) TO authenticated;
