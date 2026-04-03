-- ============================================================
-- Migration 059: Cleanup deprecated nomenclature columns
-- Phase 10.1 — Remove brand_id and syrve_id from nomenclature
-- ============================================================
-- brand_id  → migrated to sku.brand_id (migration 057)
-- syrve_id  → legacy SYRVE integration, unused since Phase 6
-- category_id stays (active FK to product_categories)
-- ============================================================

BEGIN;

-- 1. DROP nomenclature.brand_id (FK constraint + column)
ALTER TABLE nomenclature DROP CONSTRAINT IF EXISTS nomenclature_brand_id_fkey;
ALTER TABLE nomenclature DROP COLUMN IF EXISTS brand_id;

-- 2. DROP nomenclature.syrve_id (no FK, just UUID column)
ALTER TABLE nomenclature DROP COLUMN IF EXISTS syrve_id;

-- 3. Update table comment
COMMENT ON TABLE nomenclature IS 'Abstract ingredient/product. Brand/barcode/package → sku table (Phase 10).';

COMMIT;
