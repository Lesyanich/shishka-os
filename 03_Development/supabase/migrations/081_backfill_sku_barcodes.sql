-- ═══════════════════════════════════════════════════════════════
-- Migration 081: Backfill SKU barcodes from supplier_catalog
--
-- PROBLEM: SKUs auto-created by fn_approve_receipt lacked barcodes
-- because the MCP agent's approve_receipt tool didn't pass the
-- barcode field. The barcode data exists in supplier_catalog.supplier_sku
-- (from Makro receipt parsing) but was never copied to sku.barcode.
--
-- FIX: Copy supplier_sku → sku.barcode where:
--   1. supplier_catalog.sku_id links to sku.id
--   2. sku.barcode IS NULL (don't overwrite existing barcodes)
--   3. supplier_sku looks like a valid barcode (8-14 digits)
--   4. No barcode conflict (unique index on sku.barcode)
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Backfill sku.barcode from supplier_catalog.supplier_sku
-- Only for numeric barcodes (EAN-8, EAN-13, UPC-A, ITF-14)
UPDATE public.sku
SET barcode = sc.supplier_sku,
    updated_at = now()
FROM public.supplier_catalog sc
WHERE sc.sku_id = sku.id
  AND sku.barcode IS NULL
  AND sc.supplier_sku IS NOT NULL
  AND sc.supplier_sku ~ '^\d{8,14}$'
  AND NOT EXISTS (
    -- Avoid unique constraint violation
    SELECT 1 FROM public.sku existing
    WHERE existing.barcode = sc.supplier_sku
      AND existing.id != sku.id
  );

-- Step 2: Also backfill from supplier_catalog.barcode field
-- (some records have barcode from Makro product lookup)
UPDATE public.sku
SET barcode = sc.barcode,
    updated_at = now()
FROM public.supplier_catalog sc
WHERE sc.sku_id = sku.id
  AND sku.barcode IS NULL
  AND sc.barcode IS NOT NULL
  AND sc.barcode ~ '^\d{8,14}$'
  AND NOT EXISTS (
    SELECT 1 FROM public.sku existing
    WHERE existing.barcode = sc.barcode
      AND existing.id != sku.id
  );

-- Verification query (run manually):
-- SELECT count(*) FILTER (WHERE barcode IS NOT NULL) AS with_barcode,
--        count(*) AS total
-- FROM public.sku WHERE is_active;
