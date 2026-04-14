-- ═══════════════════════════════════════════════════════════════
-- Migration 127: Add ocr_profile JSONB to suppliers
-- Stores per-supplier OCR hints, format rules, and few-shot examples
-- learned from approved receipts.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS ocr_profile JSONB DEFAULT NULL;

COMMENT ON COLUMN public.suppliers.ocr_profile IS
  'Per-supplier OCR profile learned from approved receipts. Contains: format_hint (column layout), vat_mode (included/separate), barcode_format, example_items (few-shot), rules (post-processing). Updated on receipt approval.';

-- ── Seed profiles for known suppliers ──

UPDATE public.suppliers SET ocr_profile = jsonb_build_object(
  'format_hint', 'QUANTITY | BARCODE(13-digit EAN) + Thai_name - English_name | PACKS | UNIT_PRICE | VAT_CODE | TOTAL',
  'vat_mode', 'included',
  'barcode_format', 'EAN-13 starting with 88',
  'has_tax_invoice', true,
  'rules', jsonb_build_array(
    'VAT is always included in item prices (code 2)',
    'English name follows Thai name after " - " separator',
    'Discount line labeled MEM.DISC is always negative',
    'Barcode is 13-digit EAN-13, not the article number'
  )
) WHERE LOWER(name) LIKE '%makro%';

UPDATE public.suppliers SET ocr_profile = jsonb_build_object(
  'format_hint', 'BARCODE | Thai_name | QTY | UNIT_PRICE | TOTAL',
  'vat_mode', 'included',
  'barcode_format', 'EAN-13',
  'has_tax_invoice', true,
  'rules', jsonb_build_array(
    'VAT is included in item prices',
    'English name may not be present — translate Thai'
  )
) WHERE LOWER(name) LIKE '%big c%' OR LOWER(name) LIKE '%lotus%' OR LOWER(name) LIKE '%tops%';

UPDATE public.suppliers SET ocr_profile = jsonb_build_object(
  'format_hint', 'CODE(4-8 digit article) | DESCRIPTION(often English) | QTY | UNIT_PRICE | TOTAL',
  'vat_mode', 'included',
  'barcode_format', 'article code 4-8 digits as supplier_sku, separate EAN-13 if present',
  'has_tax_invoice', true,
  'rules', jsonb_build_array(
    'CODE column is article/product code — save as supplier_sku, NOT barcode',
    'Descriptions are often English abbreviations',
    'Items are typically OpEx or CapEx'
  )
) WHERE LOWER(name) LIKE '%homepro%' OR LOWER(name) LIKE '%watsadu%' OR LOWER(name) LIKE '%baan%beyond%';

UPDATE public.suppliers SET ocr_profile = jsonb_build_object(
  'format_hint', 'Handwritten or small thermal — freeform layout',
  'vat_mode', 'none',
  'barcode_format', 'none',
  'has_tax_invoice', false,
  'rules', jsonb_build_array(
    'No barcodes — set barcode and supplier_sku to null',
    'Weight as quantity: "2.5 kg × 180"',
    'Infer supplier from items if no company name printed'
  )
) WHERE LOWER(name) IN ('water delivery', 'ice supplier', 'gas supplier', 'local market', 'cash purchase');

-- ── Self-register ──
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '127_supplier_ocr_profile.sql',
  'claude-code',
  NULL,
  'Add ocr_profile JSONB to suppliers. Seed profiles for Makro, BigC/Lotus/Tops, HomePro/Watsadu, market vendors.'
);
