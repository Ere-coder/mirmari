-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 8 Schema
-- Run in Supabase SQL Editor AFTER schema-phase7.sql (in order).
--
-- Adds:
--   • profiles.display_name  — user-facing display name (optional)
--   • fcm_tokens table       — stores Firebase Cloud Messaging tokens per user
--
-- Notes on display_name:
--   The app has had a name column attempted in code since Phase 1 but no
--   schema migration was ever written for it. Phase 8 formalises this as
--   display_name. Existing profile rows will have display_name = NULL and
--   will fall back to district wherever names are displayed.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── profiles.display_name ─────────────────────────────────────────────────────
-- Optional free-text display name chosen by the user during onboarding.
-- Shown in chats, profile pages, and the admin dashboard.
-- Falls back to district when NULL.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill: if the old `name` column exists (from earlier uncommitted migration),
-- copy its values into display_name and drop the old column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'name'
  ) THEN
    -- Copy existing name values to display_name where display_name is still null
    UPDATE public.profiles
    SET display_name = name
    WHERE name IS NOT NULL AND display_name IS NULL;

    -- Drop the now-superseded name column
    ALTER TABLE public.profiles DROP COLUMN name;
  END IF;
END;
$$;


-- ── fcm_tokens ────────────────────────────────────────────────────────────────
-- One or more FCM tokens per user (multiple devices / browsers).
-- Inserted by the client (FCMInitializer component) after the user grants
-- notification permission. Deleted when the user explicitly denies or logs out.
--
-- Tokens are only ever sent server-side (from server actions) — never exposed
-- to other clients. RLS enforces this: no SELECT policy means tokens are
-- write-only from the client.

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL,
  -- Prevent duplicate token entries for the same user
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fcm_tokens_user_token_unique UNIQUE (user_id, token)
);

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Users can insert their own tokens (triggered by FCMInitializer on the client)
CREATE POLICY "fcm_tokens_insert_own"
  ON public.fcm_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own tokens (e.g. on sign-out or permission revoke)
CREATE POLICY "fcm_tokens_delete_own"
  ON public.fcm_tokens FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- No SELECT policy — tokens are only readable server-side via SECURITY DEFINER
-- functions or the service_role key used in server actions.

-- Index for fast token lookup by user_id (used by the notification server action)
CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON public.fcm_tokens(user_id);
