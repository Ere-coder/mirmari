-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari v2 — Phase 9: v1 Cleanup
-- Run in Supabase SQL Editor AFTER all prior v2 phase schemas.
--
-- What this does:
--   1. Migrates profiles: delivery_zone NOT NULL, drops district and city columns.
--   2. Drops all v1 tables and their associated triggers / functions.
--   3. Drops v1 enums.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Profiles migration ───────────────────────────────────────────────

-- Back-fill delivery_zone from district for any rows where it is still NULL.
UPDATE public.profiles
SET    delivery_zone = district
WHERE  delivery_zone IS NULL AND district IS NOT NULL;

-- Make delivery_zone NOT NULL now that all rows have a value.
ALTER TABLE public.profiles
  ALTER COLUMN delivery_zone SET NOT NULL;

-- Drop the old v1 columns (district was the original, city is hardcoded Tbilisi).
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS district,
  DROP COLUMN IF EXISTS city;

-- ── Step 2: Drop v1 triggers and functions ───────────────────────────────────

-- credit_value trigger on items
DROP TRIGGER IF EXISTS set_credit_value ON public.items;
DROP FUNCTION IF EXISTS public.compute_credit_value() CASCADE;

-- auto-create credits row on profile insert
DROP TRIGGER IF EXISTS create_credits_on_profile ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_profile() CASCADE;

-- advance_queue and related RPCs (all SECURITY DEFINER)
DROP FUNCTION IF EXISTS public.join_queue(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_queue(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.advance_queue(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_queue_claim(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.claim_item(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.return_item(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.reclaim_item(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_handover(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_unread_count() CASCADE;
DROP FUNCTION IF EXISTS public.submit_damage_report(UUID, UUID, TEXT, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.pay_insurance(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.classify_repairable(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.classify_irreversible(UUID, UUID) CASCADE;

-- ── Step 3: Drop v1 tables (children before parents) ────────────────────────

-- Damage & insurance (depend on borrows and items)
DROP TABLE IF EXISTS public.reimbursements        CASCADE;
DROP TABLE IF EXISTS public.insurance_payments     CASCADE;
DROP TABLE IF EXISTS public.damage_reports         CASCADE;

-- Handover confirmations (depend on borrows)
DROP TABLE IF EXISTS public.handover_confirmations CASCADE;

-- v1 chat system (depend on borrows and items)
DROP TABLE IF EXISTS public.messages               CASCADE;
DROP TABLE IF EXISTS public.chats                  CASCADE;

-- Queue (depends on items and profiles)
DROP TABLE IF EXISTS public.queue                  CASCADE;

-- Borrows (depend on items and profiles)
DROP TABLE IF EXISTS public.borrows                CASCADE;

-- Credits (depend on profiles)
DROP TABLE IF EXISTS public.credit_transactions    CASCADE;
DROP TABLE IF EXISTS public.credits                CASCADE;

-- Items and images (depend on profiles)
DROP TABLE IF EXISTS public.item_images            CASCADE;
DROP TABLE IF EXISTS public.items                  CASCADE;

-- ── Step 4: Drop v1 enums ────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.item_category          CASCADE;
DROP TYPE IF EXISTS public.item_status            CASCADE;
DROP TYPE IF EXISTS public.image_layer            CASCADE;
DROP TYPE IF EXISTS public.primary_size           CASCADE;
DROP TYPE IF EXISTS public.credit_transaction_type CASCADE;
DROP TYPE IF EXISTS public.borrow_status          CASCADE;
DROP TYPE IF EXISTS public.queue_status           CASCADE;
DROP TYPE IF EXISTS public.chat_type              CASCADE;
DROP TYPE IF EXISTS public.damage_report_status   CASCADE;
DROP TYPE IF EXISTS public.insurance_payment_status CASCADE;
