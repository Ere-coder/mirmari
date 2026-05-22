-- Admin-entered piece count per outfit slot (displayed to users on /wardrobe).
-- Optional: when NULL the wardrobe falls back to the number of items in the
-- outfit_composition (each garment = 1 piece).
ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS pieces INT
  CHECK (pieces IS NULL OR pieces >= 0);
