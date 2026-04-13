-- ── MirMari — Supabase Schema (Phase 1) ────────────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New query
--
-- This creates the `profiles` table referenced in spec §DATABASE.
-- It stores user onboarding data and references auth.users for identity.
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles table — spec §DATABASE
-- One row per user, created during onboarding (/onboarding page).
CREATE TABLE IF NOT EXISTS public.profiles (
  -- id mirrors the Supabase auth user id (UUID)
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Collected during onboarding
  phone       TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT 'Tbilisi',  -- hardcoded per spec, Phase 1
  district    TEXT NOT NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row Level Security (RLS) ─────────────────────────────────────────────────
-- Enable RLS so users can only read/write their own profile row.
-- Without this, any authenticated user could read everyone's profile.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile (onboarding — only once)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile (for future profile editing)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Trigger: auto-create profile stub on signup (optional) ──────────────────
-- [ADDED: convenience] If you want profiles to exist immediately after
-- auth.users is created (before onboarding completes), you can enable this.
-- For Phase 1 the onboarding page does the INSERT, so this is commented out.
--
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS trigger AS $$
-- BEGIN
--   INSERT INTO public.profiles (id) VALUES (new.id)
--   ON CONFLICT (id) DO NOTHING;
--   RETURN new;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
--
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
