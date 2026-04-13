-- ─────────────────────────────────────────────────────────────────────────────
-- [ADDED: user name field]
-- Adds a nullable `name` column to the profiles table.
-- Nullable so existing rows are unaffected and the column can be back-filled
-- gradually (users who onboarded before this migration simply have name = NULL).
-- Run in Supabase SQL Editor after schema-phase3.sql.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT;
