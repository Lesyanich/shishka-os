-- ═══════════════════════════════════════════════════════════════
-- Migration 217: Add image_url to supplier_catalog
-- Stores product image URL from supplier website/CDN
-- (e.g. https://images.mango-prod.siammakro.cloud/product-images/...)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.supplier_catalog
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.supplier_catalog.image_url
  IS 'Product image URL from supplier CDN (e.g. Makro product photo)';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '217_add_image_url_to_supplier_catalog.sql',
    'claude-code',
    'Add image_url column to supplier_catalog for product photos from supplier CDN.'
) ON CONFLICT (filename) DO NOTHING;
