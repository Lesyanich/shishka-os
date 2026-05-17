-- Migration 191: dish-photos Storage bucket
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §7 (Photo upload)
-- Stores customer/assembler/kitchen dish reference photos.
-- Path convention: {photo_role}/{nomenclature_id}.{ext} where photo_role ∈ {customer, assembler, kitchen}.
-- URL is stored on:
--   nomenclature.customer_photo_url  → customer-facing
--   dish_card.assembler_photo_url    → L2 reference
--   pf_pack_card.kitchen_photo_url   → L1 reference
--
-- Bucket is public-read (customer photos render on /menu and future public site).
-- Authenticated users can upload/update/delete.
-- Per-role RLS for write deferred until User Management UI (MC 6e4b56bf).

BEGIN;

-- 1. Create bucket (public read for customer-facing photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dish-photos',
  'dish-photos',
  true,
  3145728,  -- 3MB per photo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: anyone can read (customer + cashier preview)
DROP POLICY IF EXISTS "Public read dish-photos" ON storage.objects;
CREATE POLICY "Public read dish-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dish-photos');

-- 3. RLS: authenticated can upload
DROP POLICY IF EXISTS "Authenticated upload dish-photos" ON storage.objects;
CREATE POLICY "Authenticated upload dish-photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'dish-photos');

-- 4. RLS: authenticated can update (re-upload over existing key)
DROP POLICY IF EXISTS "Authenticated update dish-photos" ON storage.objects;
CREATE POLICY "Authenticated update dish-photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'dish-photos')
  WITH CHECK (bucket_id = 'dish-photos');

-- 5. RLS: authenticated can delete
DROP POLICY IF EXISTS "Authenticated delete dish-photos" ON storage.objects;
CREATE POLICY "Authenticated delete dish-photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'dish-photos');

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '191_dish_photos_storage_bucket.sql',
  'claude-code',
  'dish-photos Storage bucket: public read, authenticated write/delete, 3 MB limit, image-only.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
