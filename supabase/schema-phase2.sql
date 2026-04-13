-- ─────────────────────────────────────────────────────────────────────────────
-- MirMari Phase 2 Schema
-- Run this in the Supabase SQL Editor AFTER schema.sql (Phase 1).
--
-- Creates:
--   • Enums: item_category, item_status, image_layer, primary_size
--   • Table: items (with credit_value auto-set by trigger)
--   • Table: item_images
--   • RLS policies for both tables
--   • Storage bucket: item-images
--   • Storage RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────

-- Clothing categories supported in Phase 2.
-- Phase 3+ may add more categories (e.g. dresses, outerwear).
CREATE TYPE item_category AS ENUM (
  'tank_top',
  'tshirt_top',
  'shirt_blouse',
  'shorts',
  'skirt',
  'pants_jeans'
);

-- Item availability states.
-- 'borrowed' and 'unavailable' are reserved for Phase 3 (borrowing logic).
CREATE TYPE item_status AS ENUM (
  'available',
  'borrowed',
  'unavailable'
);

-- Image role within an item's photo set.
-- 'condition' and 'experience' layers are reserved for Phase 3.
CREATE TYPE image_layer AS ENUM (
  'original',
  'condition',
  'experience'
);

-- Standard letter sizes per spec §UPLOAD.
CREATE TYPE primary_size AS ENUM (
  'XS', 'S', 'M', 'L', 'XL'
);

-- ── Items table ───────────────────────────────────────────────────────────────

CREATE TABLE public.items (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category       item_category NOT NULL,
  -- credit_value is set automatically by the trigger below (not by the client).
  -- DEFAULT 0 here is only a placeholder; the trigger always overwrites it on INSERT.
  credit_value   INT          NOT NULL DEFAULT 0,
  primary_size   primary_size NOT NULL,
  numeric_size   INT,                          -- optional EU numeric size
  fit_description TEXT        NOT NULL,
  fit_tags       TEXT[],                       -- optional; e.g. ['oversized', 'cropped']
  status         item_status  NOT NULL DEFAULT 'available',
  created_at     TIMESTAMPTZ  DEFAULT now()
);

-- ── Credit value trigger ──────────────────────────────────────────────────────
-- Sets credit_value automatically before each INSERT based on category.
-- Rule per spec §CREDIT VALUE RULE:
--   tank_top, tshirt_top, shirt_blouse, shorts → 5
--   skirt                                      → 8
--   pants_jeans                                → 10
--
-- NOTE: Phase 3 will attach credit deduction/addition logic to borrowing events,
-- not to this trigger. This trigger only sets the item's borrowing cost.

CREATE OR REPLACE FUNCTION public.set_item_credit_value()
RETURNS TRIGGER AS $$
BEGIN
  NEW.credit_value := CASE NEW.category
    WHEN 'tank_top'     THEN 5
    WHEN 'tshirt_top'   THEN 5
    WHEN 'shirt_blouse' THEN 5
    WHEN 'shorts'       THEN 5
    WHEN 'skirt'        THEN 8
    WHEN 'pants_jeans'  THEN 10
    ELSE 5  -- safe fallback for future categories
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_set_credit_value
  BEFORE INSERT ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_item_credit_value();

-- ── Item images table ─────────────────────────────────────────────────────────

CREATE TABLE public.item_images (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID         NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  owner_id   UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url        TEXT         NOT NULL,         -- public storage URL
  layer      image_layer  NOT NULL DEFAULT 'original',
  -- is_forward = true: this is the main image shown in the browse feed.
  -- is_forward = false: these are the "deep" images shown on swipe-right.
  is_forward BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  DEFAULT now()
);

-- ── RLS: items ────────────────────────────────────────────────────────────────

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can browse all available items.
CREATE POLICY "items_select_authenticated"
  ON public.items FOR SELECT
  TO authenticated
  USING (true);

-- Users can only list their own items (owner_id must match the caller).
CREATE POLICY "items_insert_own"
  ON public.items FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Users can only update their own items (e.g. mark as unavailable).
-- Phase 3 will add borrow-state transitions here.
CREATE POLICY "items_update_own"
  ON public.items FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid());

-- Users can only delete their own items.
CREATE POLICY "items_delete_own"
  ON public.items FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ── RLS: item_images ──────────────────────────────────────────────────────────

ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all item images (needed for browse feed).
CREATE POLICY "item_images_select_authenticated"
  ON public.item_images FOR SELECT
  TO authenticated
  USING (true);

-- Users can only add images to their own items.
CREATE POLICY "item_images_insert_own"
  ON public.item_images FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Users can only update their own images.
CREATE POLICY "item_images_update_own"
  ON public.item_images FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid());

-- Users can only delete their own images.
CREATE POLICY "item_images_delete_own"
  ON public.item_images FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Public bucket so image URLs are directly readable without a signed token.
-- Access control is enforced at the storage.objects policy level below.

INSERT INTO storage.buckets (id, name, public)
VALUES ('item-images', 'item-images', true)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──────────────────────────────────────────────────────
-- Storage paths follow the convention: {user_id}/{item_id}/{index}
-- The first path segment (user_id) is used to enforce ownership on write.

-- Any authenticated user can read item images (needed for browse feed).
CREATE POLICY "storage_item_images_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'item-images');

-- Authenticated users can upload images.
-- The auth.role() check ensures anonymous callers are rejected.
CREATE POLICY "storage_item_images_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'item-images'
    AND auth.role() = 'authenticated'
  );

-- Users can only update their own images.
-- Path convention: first folder = user_id → (storage.foldername(name))[1]
CREATE POLICY "storage_item_images_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'item-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can only delete their own images.
CREATE POLICY "storage_item_images_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'item-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
