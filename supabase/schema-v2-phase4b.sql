-- ============================================================
-- MirMari v2 — Phase 4b: Outfit Set Saves (public browse + heart)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outfit_set_saves (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_set_id UUID NOT NULL REFERENCES public.outfit_sets(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, outfit_set_id)
);

ALTER TABLE public.outfit_set_saves ENABLE ROW LEVEL SECURITY;

-- Users manage their own saves
CREATE POLICY "users_own_saves"
  ON public.outfit_set_saves
  FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin can read all saves
CREATE POLICY "admin_read_saves"
  ON public.outfit_set_saves
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
