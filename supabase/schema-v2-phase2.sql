-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari v2 — Phase 2 Schema: Inventory
-- Run AFTER schema-v2-phase1.sql.
--
-- Creates:
--   • Enums:  season_status, demand_level, set_status,
--             outfit_item_category, outfit_item_status
--   • Helper: is_admin() SECURITY DEFINER function
--   • Tables: seasons, outfit_items, outfit_item_images,
--             outfit_sets, outfits, outfit_composition
--   • RPC:    create_outfit_set(season_id, code)
--   • Storage bucket: outfit-images (public)
--   • RLS policies for all new tables + storage
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.season_status AS ENUM (
    'planning', 'pending_launch', 'active', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.demand_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.set_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outfit_item_category AS ENUM (
    'top', 'bottom', 'dress', 'outerwear', 'accessory'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outfit_item_status AS ENUM ('active', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── is_admin() helper ─────────────────────────────────────────────────────────
-- SECURITY DEFINER: bypasses RLS when querying profiles, so it can be safely
-- used inside RLS policies on other tables without triggering recursion.
-- Returns true only when auth.uid() matches a profile with is_admin = true.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;


-- ── seasons ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seasons (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          NOT NULL,
  starts_at     DATE          NOT NULL,
  ends_at       DATE          NOT NULL,
  min_users     INT           NOT NULL DEFAULT 5,
  demand_level  demand_level  NOT NULL DEFAULT 'medium',
  status        season_status NOT NULL DEFAULT 'planning',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seasons_admin_all"
  ON public.seasons FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Regular users read active seasons (needed for Phase 5 browsing)
CREATE POLICY "seasons_user_read_active"
  ON public.seasons FOR SELECT
  TO authenticated
  USING (status = 'active');


-- ── outfit_items ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outfit_items (
  id          UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID                  NOT NULL REFERENCES public.profiles(id),
  season_id   UUID                  NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name        TEXT                  NOT NULL,
  description TEXT,
  category    outfit_item_category  NOT NULL,
  -- TEXT with CHECK avoids dependency on the v1 primary_size enum
  size        TEXT                  NOT NULL CHECK (size IN ('XS', 'S', 'M', 'L', 'XL')),
  color       TEXT                  NOT NULL,
  brand       TEXT,
  status      outfit_item_status    NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT now()
);

ALTER TABLE public.outfit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outfit_items_admin_all"
  ON public.outfit_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "outfit_items_user_read_active"
  ON public.outfit_items FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE INDEX IF NOT EXISTS outfit_items_season_idx ON public.outfit_items(season_id);


-- ── outfit_item_images ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outfit_item_images (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID        NOT NULL REFERENCES public.outfit_items(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  is_primary BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outfit_item_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outfit_item_images_admin_all"
  ON public.outfit_item_images FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "outfit_item_images_user_read"
  ON public.outfit_item_images FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS outfit_item_images_item_idx ON public.outfit_item_images(item_id);


-- ── outfit_sets ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outfit_sets (
  id         UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  code       CHAR(1)    NOT NULL,
  season_id  UUID       NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  status     set_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, season_id),
  -- A through O = 15 sets maximum per season
  CHECK (code >= 'A' AND code <= 'O')
);

ALTER TABLE public.outfit_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outfit_sets_admin_all"
  ON public.outfit_sets FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "outfit_sets_user_read_active"
  ON public.outfit_sets FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE INDEX IF NOT EXISTS outfit_sets_season_idx ON public.outfit_sets(season_id);


-- ── outfits ───────────────────────────────────────────────────────────────────
-- Each set has exactly 3 outfits (one per week slot).
-- Slot 1 = Monday–Tuesday, 2 = Wednesday–Thursday, 3 = Friday–Saturday.

CREATE TABLE IF NOT EXISTS public.outfits (
  id     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID    NOT NULL REFERENCES public.outfit_sets(id) ON DELETE CASCADE,
  slot   INT     NOT NULL,
  name   TEXT,
  UNIQUE (set_id, slot),
  CHECK  (slot IN (1, 2, 3))
);

ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outfits_admin_all"
  ON public.outfits FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "outfits_user_read"
  ON public.outfits FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS outfits_set_idx ON public.outfits(set_id);


-- ── outfit_composition ────────────────────────────────────────────────────────
-- Assigns outfit_items to outfits. One item can appear in at most one outfit
-- per slot (enforced manually by admin; no DB constraint on cross-outfit uniqueness).

CREATE TABLE IF NOT EXISTS public.outfit_composition (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id UUID NOT NULL REFERENCES public.outfits(id)       ON DELETE CASCADE,
  item_id   UUID NOT NULL REFERENCES public.outfit_items(id)  ON DELETE CASCADE,
  UNIQUE (outfit_id, item_id)
);

ALTER TABLE public.outfit_composition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outfit_composition_admin_all"
  ON public.outfit_composition FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "outfit_composition_user_read"
  ON public.outfit_composition FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS outfit_composition_outfit_idx ON public.outfit_composition(outfit_id);
CREATE INDEX IF NOT EXISTS outfit_composition_item_idx   ON public.outfit_composition(item_id);


-- ── create_outfit_set RPC ─────────────────────────────────────────────────────
-- Atomically creates an outfit_set row plus its 3 outfit slot rows.
-- Called by the admin UI so the set is always created with all 3 slots.

CREATE OR REPLACE FUNCTION public.create_outfit_set(
  p_season_id UUID,
  p_code      CHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_set_id UUID;
BEGIN
  -- Admin check (SECURITY DEFINER bypasses RLS so we check manually)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.outfit_sets (code, season_id, status)
  VALUES (p_code, p_season_id, 'active')
  RETURNING id INTO v_set_id;

  INSERT INTO public.outfits (set_id, slot, name) VALUES
    (v_set_id, 1, 'Monday – Tuesday'),
    (v_set_id, 2, 'Wednesday – Thursday'),
    (v_set_id, 3, 'Friday – Saturday');

  RETURN v_set_id;
END;
$$;

-- Only admins should call this; regular users have no direct path to it
GRANT EXECUTE ON FUNCTION public.create_outfit_set TO authenticated;


-- ── update_season_status RPC ──────────────────────────────────────────────────
-- Advances season status from planning → pending_launch (admin-triggered).
-- The active transition is handled by generate_rotation_cycle in Phase 4.

CREATE OR REPLACE FUNCTION public.update_season_status(
  p_season_id UUID,
  p_status    season_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.seasons
  SET status = p_status
  WHERE id = p_season_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_season_status TO authenticated;


-- ── Storage: outfit-images bucket ─────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'outfit-images',
  'outfit-images',
  true,
  10485760,   -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Admins can upload
CREATE POLICY "outfit_images_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'outfit-images'
    AND public.is_admin()
  );

-- Admins can update/replace
CREATE POLICY "outfit_images_update_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'outfit-images' AND public.is_admin());

-- Admins can delete
CREATE POLICY "outfit_images_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'outfit-images' AND public.is_admin());

-- Anyone authenticated can read (images are displayed to users in Phase 5)
CREATE POLICY "outfit_images_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'outfit-images');
