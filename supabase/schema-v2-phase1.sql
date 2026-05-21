-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari v2 — Phase 1 Schema Migration
-- Run in Supabase SQL Editor AFTER all v1 schema files (schema-phase8.sql last).
--
-- Adds two new columns to `profiles`:
--   • delivery_zone  — replaces `district` (same Tbilisi zones, renamed for v2)
--   • size_preference — user's preferred clothing size (XS–XL)
--
-- Migration strategy:
--   • `district` (NOT NULL) is kept intact — existing rows are unaffected.
--   • `delivery_zone` is nullable; new onboarding writes to both columns
--     so both remain consistent during the v1→v2 transition.
--   • Phase 9 will: DROP COLUMN district, ALTER delivery_zone SET NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── delivery_zone ─────────────────────────────────────────────────────────────
-- Semantic rename of `district` for v2. Nullable during transition; Phase 9
-- will make it NOT NULL once district is dropped.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS delivery_zone TEXT;

-- Backfill: copy existing district values into delivery_zone for all current rows.
UPDATE public.profiles
  SET delivery_zone = district
  WHERE delivery_zone IS NULL AND district IS NOT NULL;


-- ── size_preference ───────────────────────────────────────────────────────────
-- User's preferred clothing size. Collected during onboarding v2.
-- Constrained to the standard size set. NULL = not yet provided (pre-v2 users).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS size_preference TEXT
  CHECK (size_preference IN ('XS', 'S', 'M', 'L', 'XL'));


-- ── RLS: admin reads ─────────────────────────────────────────────────────────
-- An admin-only SELECT policy here would self-reference profiles
-- (EXISTS SELECT … FROM profiles WHERE is_admin), which Postgres treats as
-- infinite recursion and fails the whole query. Phase 3's
-- `profiles_select_all_authenticated USING (true)` already lets every
-- authenticated user (including admins) read all profiles, so no extra
-- policy is needed for v2.
