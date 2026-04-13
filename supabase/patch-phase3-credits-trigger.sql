-- ─────────────────────────────────────────────────────────────────────────────
-- Patch: fix create_user_credits trigger — add SECURITY DEFINER
--
-- Problem: create_user_credits() was missing SECURITY DEFINER.
-- When a new user's profiles INSERT fires the trigger, the function runs
-- under the authenticated user's RLS context. The credits table has RLS
-- enabled with no INSERT policy for authenticated users, so the trigger's
-- INSERT INTO credits was blocked by RLS — causing the entire profiles
-- INSERT to fail with a policy violation error.
--
-- Fix: add SECURITY DEFINER so the function runs as the function owner
-- (postgres / supabase_admin) and bypasses RLS, exactly like claim_item.
--
-- Run this in the Supabase SQL Editor on any database where schema-phase3.sql
-- has already been applied.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;
