-- ============================================================
-- MirMari v2 — Phase 5: Reservations (Booking)
-- ============================================================

-- ── reservation_status enum ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── reservations table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reservations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_set_id UUID NOT NULL REFERENCES public.outfit_sets(id),
  week_start    DATE NOT NULL,        -- always a Monday
  status        public.reservation_status NOT NULL DEFAULT 'confirmed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique indexes so cancelled reservations don't block future bookings
CREATE UNIQUE INDEX IF NOT EXISTS reservations_user_week_confirmed
  ON public.reservations(user_id, week_start)
  WHERE status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS reservations_set_week_confirmed
  ON public.reservations(outfit_set_id, week_start)
  WHERE status = 'confirmed';

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_reservations"
  ON public.reservations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_reservations"
  ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_reservations"
  ON public.reservations FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_all_reservations"
  ON public.reservations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── book_outfit_set ───────────────────────────────────────────────────────────
-- Validates eligibility and creates a confirmed reservation atomically.
CREATE OR REPLACE FUNCTION public.book_outfit_set(
  p_outfit_set_id UUID,
  p_week_start    DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_reservation_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Active subscription required
  IF NOT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active subscription required');
  END IF;

  -- Set must belong to an active season
  IF NOT EXISTS (
    SELECT 1
      FROM outfit_sets os
      JOIN seasons s ON s.id = os.season_id
     WHERE os.id = p_outfit_set_id
       AND os.status = 'active'
       AND s.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Outfit set not available');
  END IF;

  -- week_start must be a Monday
  IF EXTRACT(ISODOW FROM p_week_start) != 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start must be a Monday');
  END IF;

  INSERT INTO reservations (user_id, outfit_set_id, week_start)
  VALUES (v_user_id, p_outfit_set_id, p_week_start)
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This set or week is already booked');
END;
$$;

-- ── cancel_reservation ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE reservations
     SET status = 'cancelled'
   WHERE id = p_reservation_id
     AND user_id = v_user_id
     AND status = 'confirmed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_outfit_set(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(UUID) TO authenticated;
