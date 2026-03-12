-- ═══════════════════════════════════════════════════════════════════
-- Migration 039: UoM Conversion Layer
-- Phase 6.4 — Convert receipt units to inventory base units
-- ═══════════════════════════════════════════════════════════════════
-- Problem: CEO buys "Lemons 4-pack" (pcs) but kitchen tracks in kg.
-- Each unique purchase variant (SKU) gets its own conversion factor
-- stored in supplier_item_mapping.
--
-- Formula: inventory_quantity = receipt_quantity × conversion_factor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE supplier_item_mapping
  ADD COLUMN IF NOT EXISTS purchase_unit      TEXT,
  ADD COLUMN IF NOT EXISTS conversion_factor  NUMERIC,
  ADD COLUMN IF NOT EXISTS base_unit          TEXT;

COMMENT ON COLUMN supplier_item_mapping.purchase_unit     IS 'Unit as printed on receipt (e.g., "pcs", "pack", "bag 500g")';
COMMENT ON COLUMN supplier_item_mapping.conversion_factor IS 'Multiplier: 1 purchase_unit = N base_units (e.g., 1 pack = 0.5 kg → factor = 0.5)';
COMMENT ON COLUMN supplier_item_mapping.base_unit         IS 'Target unit from nomenclature (kg, L, pcs)';
