-- ============================================================
-- MirMari v2 — Phase 8: Outfit Experiences + Profile history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outfit_experiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_set_id UUID REFERENCES public.outfit_sets(id) ON DELETE SET NULL,
  admin_id      UUID NOT NULL REFERENCES auth.users(id),
  image_url     TEXT NOT NULL,
  caption       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outfit_experiences ENABLE ROW LEVEL SECURITY;

-- Users can view their own experiences
CREATE POLICY "users_read_own_experiences"
  ON public.outfit_experiences FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Admin full access
CREATE POLICY "admin_all_experiences"
  ON public.outfit_experiences FOR ALL TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Storage bucket: experience-images ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('experience-images', 'experience-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin_upload_experience_images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'experience-images' AND public.is_admin());

CREATE POLICY "admin_delete_experience_images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'experience-images' AND public.is_admin());

CREATE POLICY "public_read_experience_images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'experience-images');
