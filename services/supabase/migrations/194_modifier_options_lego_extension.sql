-- Migration 194 — extend nomenclature_modifier_options for lego flow
-- Adds: slot (groups options in Loyverse modifier_lists + KDS card)
--       quantity_per_unit (BOM-deduction multiplier)
--       loyverse_modifier_id / loyverse_modifier_list_id / loyverse_modifier_list_name (Loyverse linkage)
-- Safe: table is empty today (no INSERTs in any migration); verified 2026-05-17.

BEGIN;

ALTER TABLE nomenclature_modifier_options
  ADD COLUMN slot TEXT
    CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce')),
  ADD COLUMN quantity_per_unit NUMERIC NOT NULL DEFAULT 1
    CHECK (quantity_per_unit > 0),
  ADD COLUMN loyverse_modifier_id TEXT,
  ADD COLUMN loyverse_modifier_list_id TEXT,
  ADD COLUMN loyverse_modifier_list_name TEXT;

CREATE UNIQUE INDEX idx_nomod_loyverse_modifier_id
  ON nomenclature_modifier_options (loyverse_modifier_id)
  WHERE loyverse_modifier_id IS NOT NULL;

COMMENT ON COLUMN nomenclature_modifier_options.slot IS
  'Lego slot grouping (base/protein/greens/topping/sauce). Matches bom_structures.slot vocab (mig 193).';
COMMENT ON COLUMN nomenclature_modifier_options.quantity_per_unit IS
  'Quantity of MOD-* consumed per single order unit. Multiplied with receipt qty at BOM-deduction time.';
COMMENT ON COLUMN nomenclature_modifier_options.loyverse_modifier_id IS
  'Loyverse internal modifier option id. Joined against receipt.line.modifiers[].id during webhook ingest.';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '194_modifier_options_lego_extension.sql',
  'claude-code',
  'Extend nomenclature_modifier_options with slot, quantity_per_unit, and 3 Loyverse-linkage columns. Table empty pre-migration. Lego flow Phase 1.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
