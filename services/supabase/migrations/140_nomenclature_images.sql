-- ============================================================
-- Migration 140: nomenclature_images — photo gallery for all items
--
-- Enables multiple photos per nomenclature item (RAW/PF/MOD/SALE).
-- Replaces the single nomenclature.image_url field with a proper
-- gallery table supporting sort order and primary photo selection.
--
-- STORAGE BUCKET (manual step):
--   Create bucket 'nomenclature-photos' in Supabase Dashboard:
--   - Public: YES (customer menu needs unauthenticated read)
--   - File size limit: 5MB
--   - Allowed MIME types: image/jpeg, image/png, image/webp
--   - RLS: SELECT = public, INSERT/UPDATE/DELETE = authenticated
--
-- After migration, existing image_url values are copied into this
-- table as the primary image, then image_url is kept as-is for
-- backward compatibility (UI can migrate gradually).
-- ============================================================

BEGIN;

-- ── Step 1: Create nomenclature_images table ──
CREATE TABLE IF NOT EXISTS public.nomenclature_images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id   UUID NOT NULL REFERENCES public.nomenclature(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  storage_path      TEXT,  -- e.g. 'nomenclature-photos/{nom_id}/{filename}'
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for fast lookup by nomenclature
CREATE INDEX IF NOT EXISTS idx_nom_images_nom_id
  ON public.nomenclature_images(nomenclature_id);

-- Unique partial index: only one primary photo per item
CREATE UNIQUE INDEX IF NOT EXISTS idx_nom_images_primary
  ON public.nomenclature_images(nomenclature_id)
  WHERE is_primary = true;

-- ── Step 2: RLS ──
ALTER TABLE public.nomenclature_images ENABLE ROW LEVEL SECURITY;

-- Public read (customer menu preview needs photos)
CREATE POLICY "nom_images_select"
  ON public.nomenclature_images FOR SELECT
  USING (true);

-- Authenticated write (admin panel uploads)
CREATE POLICY "nom_images_insert"
  ON public.nomenclature_images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "nom_images_update"
  ON public.nomenclature_images FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "nom_images_delete"
  ON public.nomenclature_images FOR DELETE
  USING (auth.role() = 'authenticated');

-- ── Step 3: Migrate existing image_url values ──
-- Copy non-null image_url entries as primary photos.
-- These are external URLs (no storage_path), uploaded_by unknown.
INSERT INTO public.nomenclature_images (nomenclature_id, url, storage_path, sort_order, is_primary)
SELECT id, image_url, NULL, 0, true
  FROM public.nomenclature
 WHERE image_url IS NOT NULL
   AND image_url != ''
   AND NOT EXISTS (
     SELECT 1 FROM public.nomenclature_images ni
      WHERE ni.nomenclature_id = nomenclature.id
   );

COMMENT ON TABLE public.nomenclature_images IS
  'Photo gallery for nomenclature items. Multiple images per item with sort order and primary selection.';
COMMENT ON COLUMN public.nomenclature_images.url IS
  'Full URL to the image. Either Supabase Storage public URL or external URL.';
COMMENT ON COLUMN public.nomenclature_images.storage_path IS
  'Supabase Storage path (bucket/folder/file). NULL for external URLs or legacy migrated entries.';
COMMENT ON COLUMN public.nomenclature_images.is_primary IS
  'Primary photo shown on menu cards and thumbnails. Enforced unique per nomenclature_id via partial index.';

COMMIT;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '140_nomenclature_images.sql',
  'claude-code',
  NULL,
  'Create nomenclature_images gallery table with RLS. Migrate existing image_url values as primary photos. Manual step: create nomenclature-photos Storage bucket.'
) ON CONFLICT (filename) DO NOTHING;
