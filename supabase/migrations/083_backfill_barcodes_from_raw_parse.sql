-- ============================================================
-- Migration 083: Backfill SKU barcodes from expense_ledger.raw_parse
--
-- Context: Claude finance agent stores full OCR data with barcodes
-- in expense_ledger.raw_parse JSON. This migration extracts those
-- barcodes and links them to the correct SKU records.
--
-- Strategy:
--   1. Extract (barcode, name_en) from raw_parse → items[]
--   2. Match to purchase_logs by expense_id + product name
--   3. Use purchase_logs.sku_id to update sku.barcode
--   4. Propagate to supplier_catalog
-- ============================================================

-- ── Step 1: Update sku.barcode from raw_parse via purchase_logs ──
-- Join raw_parse items to purchase_logs on same expense + matching name
WITH parsed_barcodes AS (
  SELECT DISTINCT ON (pl.sku_id)
    pl.sku_id,
    trim(item->>'barcode') AS barcode
  FROM public.expense_ledger el
  CROSS JOIN LATERAL jsonb_array_elements(el.raw_parse->'items') AS item
  JOIN public.purchase_logs pl
    ON pl.expense_id = el.id
   AND lower(trim(pl.notes)) = lower(trim(item->>'name_en'))
  WHERE el.raw_parse IS NOT NULL
    AND el.raw_parse->'items' IS NOT NULL
    AND jsonb_typeof(el.raw_parse->'items') = 'array'
    AND item->>'barcode' IS NOT NULL
    AND trim(item->>'barcode') <> ''
    AND pl.sku_id IS NOT NULL
  ORDER BY pl.sku_id, el.transaction_date DESC
)
UPDATE public.sku
SET barcode = pb.barcode
FROM parsed_barcodes pb
WHERE sku.id = pb.sku_id
  AND sku.barcode IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sku s2
    WHERE s2.barcode = pb.barcode AND s2.id <> sku.id
  );


-- ── Step 2: Also update supplier_catalog.barcode + supplier_sku ──
-- Skip rows where this (supplier_id, barcode) combo already exists
UPDATE public.supplier_catalog sc
SET
  barcode = s.barcode,
  supplier_sku = COALESCE(sc.supplier_sku, s.barcode)
FROM public.sku s
WHERE sc.sku_id = s.id
  AND s.barcode IS NOT NULL
  AND sc.barcode IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.supplier_catalog sc2
    WHERE sc2.supplier_id = sc.supplier_id
      AND sc2.barcode = s.barcode
      AND sc2.id <> sc.id
  );
