-- Allow outfit_items to be created without category or color, since the admin
-- upload form no longer collects them and they aren't displayed to users.
ALTER TABLE public.outfit_items ALTER COLUMN category DROP NOT NULL;
ALTER TABLE public.outfit_items ALTER COLUMN color    DROP NOT NULL;
