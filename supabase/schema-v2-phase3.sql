-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari v2 — Phase 3 Schema: Subscriptions
-- Run AFTER schema-v2-phase2.sql.
--
-- Creates:
--   • Enum:  subscription_status
--   • Table: subscriptions
--   • RLS policies
-- ─────────────────────────────────────────────────────────────────────────────


-- ── subscription_status enum ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'waitlisted', 'active', 'paused', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── subscriptions ─────────────────────────────────────────────────────────────
-- One row per user. UNIQUE(user_id) enforces a single subscription per account.
-- Admin updates status manually (MVP; no Stripe integration yet).
-- billing_anchor_day: day-of-month billing recurs (set when admin activates).

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID                NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status              subscription_status NOT NULL DEFAULT 'waitlisted',
  started_at          DATE                NOT NULL DEFAULT CURRENT_DATE,
  price_gel           NUMERIC(8, 2)       NOT NULL DEFAULT 150,
  billing_anchor_day  INT                 CHECK (billing_anchor_day BETWEEN 1 AND 28),
  notes               TEXT,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can join the waitlist (insert their own row)
CREATE POLICY "sub_user_insert_own"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own subscription
CREATE POLICY "sub_user_read_own"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins have full access to all subscriptions
CREATE POLICY "sub_admin_all"
  ON public.subscriptions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Index for fast admin queries (list all by status)
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_created_idx ON public.subscriptions(created_at);
