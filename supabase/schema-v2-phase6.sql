-- ============================================================
-- MirMari v2 — Phase 6: Returns + condition tracking
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.return_condition AS ENUM ('good', 'minor_issue', 'damaged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.return_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id),
  admin_id       UUID NOT NULL REFERENCES auth.users(id),
  condition      public.return_condition NOT NULL,
  notes          TEXT,
  returned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reservation_id)  -- one return event per reservation
);

ALTER TABLE public.return_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_return_events"
  ON public.return_events
  FOR ALL
  TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());
