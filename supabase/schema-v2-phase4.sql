-- ============================================================
-- MirMari v2 — Phase 4: Rotation Engine
-- ============================================================
-- Creates:
--   • rotation_cycles table
--   • generate_rotation_cycle() RPC  (pending_launch → active)
--   • validate_season_for_launch()   RPC  (checklist query)
-- ============================================================

-- ── rotation_cycles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rotation_cycles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  set_count           INT  NOT NULL,
  cycle_length_weeks  INT  NOT NULL,   -- equals set_count (1 set per week per user)
  max_concurrent      INT  NOT NULL,   -- equals set_count (1 user per set per week)
  users_promoted      INT  NOT NULL DEFAULT 0,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id)  -- one rotation cycle per season
);

ALTER TABLE public.rotation_cycles ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_rotation_cycles"
  ON public.rotation_cycles
  FOR ALL
  TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── validate_season_for_launch ────────────────────────────────────────────────
-- Returns a JSON object describing whether the season is ready to publish.
-- Safe to call repeatedly; read-only.
CREATE OR REPLACE FUNCTION public.validate_season_for_launch(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season          RECORD;
  v_set_count       INT;
  v_configured_sets INT;
  v_waitlist_count  INT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  -- Season must exist and be in pending_launch
  SELECT id, status, min_users
    INTO v_season
    FROM public.seasons
   WHERE id = p_season_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Season not found');
  END IF;

  IF v_season.status != 'pending_launch' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Season must be in pending_launch state to generate a rotation'
    );
  END IF;

  -- Count active sets
  SELECT COUNT(*)
    INTO v_set_count
    FROM public.outfit_sets
   WHERE season_id = p_season_id AND status = 'active';

  -- Count sets where every outfit slot has at least one item
  SELECT COUNT(DISTINCT os.id)
    INTO v_configured_sets
    FROM public.outfit_sets os
   WHERE os.season_id = p_season_id
     AND os.status = 'active'
     AND NOT EXISTS (
       SELECT 1
         FROM public.outfits o
        WHERE o.set_id = os.id
          AND NOT EXISTS (
            SELECT 1
              FROM public.outfit_composition oc
             WHERE oc.outfit_id = o.id
          )
     );

  -- Count waitlisted subscribers
  SELECT COUNT(*)
    INTO v_waitlist_count
    FROM public.subscriptions
   WHERE status = 'waitlisted';

  RETURN jsonb_build_object(
    'success',          true,
    'set_count',        v_set_count,
    'configured_sets',  v_configured_sets,
    'waitlist_count',   v_waitlist_count,
    'min_users',        v_season.min_users,
    'sets_ok',          (v_set_count > 0 AND v_set_count = v_configured_sets),
    'users_ok',         (v_waitlist_count >= v_season.min_users)
  );
END;
$$;

-- ── generate_rotation_cycle ───────────────────────────────────────────────────
-- Atomically:
--   1. Validates the season is pending_launch with configured sets + enough users
--   2. Inserts a rotation_cycles row
--   3. Promotes waitlisted → active (FIFO, up to set_count slots)
--   4. Marks the season as active
--
-- Returns JSONB: { success, cycle_id, set_count, users_promoted } or { success: false, error }
CREATE OR REPLACE FUNCTION public.generate_rotation_cycle(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season         RECORD;
  v_set_count      INT;
  v_configured     INT;
  v_waitlist_count INT;
  v_to_promote     INT;
  v_promoted       INT;
  v_cycle_id       UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  -- Lock and load the season
  SELECT id, status, min_users
    INTO v_season
    FROM public.seasons
   WHERE id = p_season_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Season not found');
  END IF;

  IF v_season.status != 'pending_launch' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Season must be in pending_launch state'
    );
  END IF;

  -- Validate set count
  SELECT COUNT(*)
    INTO v_set_count
    FROM public.outfit_sets
   WHERE season_id = p_season_id AND status = 'active';

  IF v_set_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active outfit sets found');
  END IF;

  -- Validate all sets are fully configured (every outfit slot has at least one item)
  SELECT COUNT(DISTINCT os.id)
    INTO v_configured
    FROM public.outfit_sets os
   WHERE os.season_id = p_season_id
     AND os.status = 'active'
     AND NOT EXISTS (
       SELECT 1
         FROM public.outfits o
        WHERE o.set_id = os.id
          AND NOT EXISTS (
            SELECT 1
              FROM public.outfit_composition oc
             WHERE oc.outfit_id = o.id
          )
     );

  IF v_configured != v_set_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('%s of %s sets are fully configured. Configure all sets before launching.', v_configured, v_set_count)
    );
  END IF;

  -- Validate minimum user threshold
  SELECT COUNT(*)
    INTO v_waitlist_count
    FROM public.subscriptions
   WHERE status = 'waitlisted';

  IF v_waitlist_count < v_season.min_users THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Need %s waitlisted users, currently have %s', v_season.min_users, v_waitlist_count)
    );
  END IF;

  -- Create rotation cycle row
  INSERT INTO public.rotation_cycles (
    season_id,
    set_count,
    cycle_length_weeks,
    max_concurrent,
    users_promoted
  )
  VALUES (
    p_season_id,
    v_set_count,
    v_set_count,   -- one week per set in the cycle
    v_set_count,   -- one user per set at a time
    0              -- updated below
  )
  RETURNING id INTO v_cycle_id;

  -- Promote waitlisted → active (FIFO by created_at, up to set_count slots)
  v_to_promote := LEAST(v_set_count, v_waitlist_count);

  WITH to_promote AS (
    SELECT id
      FROM public.subscriptions
     WHERE status = 'waitlisted'
     ORDER BY created_at ASC
     LIMIT v_to_promote
  )
  UPDATE public.subscriptions
     SET status = 'active',
         started_at = COALESCE(started_at, now())
   WHERE id IN (SELECT id FROM to_promote);

  GET DIAGNOSTICS v_promoted = ROW_COUNT;

  -- Update promoted count in cycle row
  UPDATE public.rotation_cycles
     SET users_promoted = v_promoted
   WHERE id = v_cycle_id;

  -- Activate the season
  UPDATE public.seasons
     SET status = 'active'
   WHERE id = p_season_id;

  RETURN jsonb_build_object(
    'success',        true,
    'cycle_id',       v_cycle_id,
    'set_count',      v_set_count,
    'users_promoted', v_promoted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_season_for_launch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_rotation_cycle(UUID) TO authenticated;
