-- ============================================================
-- MirMari v2 — Phase 5b: Flexible rotation booking
-- ============================================================
-- Adds book_next_available_week() RPC.
-- Cycle length is taken from rotation_cycles.cycle_length_weeks
-- (admin-defined = number of outfit sets created, 12–15).
-- ============================================================

CREATE OR REPLACE FUNCTION public.book_next_available_week(p_outfit_set_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_season_id UUID;
  v_cycle_len INT;
  v_base      DATE;
  v_candidate DATE;
  v_available DATE := NULL;
  v_res_id    UUID;
  i           INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM subscriptions WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active subscription required');
  END IF;

  -- Resolve season
  SELECT os.season_id INTO v_season_id
    FROM outfit_sets os
    JOIN seasons s ON s.id = os.season_id
   WHERE os.id = p_outfit_set_id
     AND os.status = 'active'
     AND s.status  = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Outfit set not available');
  END IF;

  -- Cycle length from rotation_cycles (= number of sets admin created)
  SELECT cycle_length_weeks INTO v_cycle_len
    FROM rotation_cycles WHERE season_id = v_season_id;

  IF NOT FOUND OR v_cycle_len IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rotation not published yet');
  END IF;

  -- Start from this Monday
  v_base := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  FOR i IN 0 .. v_cycle_len - 1 LOOP
    v_candidate := v_base + (i * 7);

    IF NOT EXISTS (
      SELECT 1 FROM reservations
       WHERE outfit_set_id = p_outfit_set_id
         AND week_start    = v_candidate
         AND status        = 'confirmed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM reservations
       WHERE user_id    = v_user_id
         AND week_start = v_candidate
         AND status     = 'confirmed'
    ) THEN
      v_available := v_candidate;
      EXIT;
    END IF;
  END LOOP;

  IF v_available IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available weeks for this set in the current cycle');
  END IF;

  INSERT INTO reservations (user_id, outfit_set_id, week_start)
  VALUES (v_user_id, p_outfit_set_id, v_available)
  RETURNING id INTO v_res_id;

  RETURN jsonb_build_object(
    'success',        true,
    'reservation_id', v_res_id,
    'week_start',     v_available
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking conflict — please try again');
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_next_available_week(UUID) TO authenticated;
