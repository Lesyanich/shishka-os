-- ═══════════════════════════════════════════════════════════════
-- Migration 044: Nomenclature Deduplication & Salt Taxonomy
-- Phase 6.8b: Clean up duplicate nomenclature entries
-- ═══════════════════════════════════════════════════════════════
-- FIX v2: Original assumed underscore-named duplicates existed alongside
--         hyphen-named items. In reality, items may already be in canonical
--         form (hyphen naming) with BOM references. All DELETEs now use
--         safe FK-aware subqueries — skips deletion if item is referenced.
--
-- CEO REQUEST: Salt → 3 variants: Iodized, Non-Iodized, Curing Salt
-- CEO REQUEST: Coconut Milk → single entry
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Helper: collect all nomenclature IDs that have FK references
-- ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE _referenced_noms AS
  SELECT DISTINCT ingredient_id AS id FROM bom_structures WHERE ingredient_id IS NOT NULL
  UNION
  SELECT DISTINCT parent_id FROM bom_structures WHERE parent_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM purchase_logs WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM inventory_balances WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM waste_logs WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM inventory_batches WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM order_items WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM plan_targets WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM supplier_item_mapping WHERE nomenclature_id IS NOT NULL
  UNION
  SELECT DISTINCT nomenclature_id FROM supplier_products WHERE nomenclature_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- Part A: SALT — ensure 3 canonical types exist
-- ──────────────────────────────────────────────────────────────
-- If old salt entries exist (RAW-FINE_SALT, RAW-SEA_SALT, RAW-SALT-SEA),
-- consolidate BOM refs and remove them. If they don't exist, no-op.

-- A1. Move BOM refs from RAW-SEA_SALT → RAW-FINE_SALT (if both exist)
UPDATE bom_structures
SET ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-FINE_SALT')
WHERE ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-SEA_SALT')
  AND EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-FINE_SALT');

-- A2. Safe-delete old salt entries (only if unreferenced)
DELETE FROM nomenclature
WHERE product_code IN ('RAW-SALT-SEA', 'RAW-SEA_SALT')
  AND id NOT IN (SELECT id FROM _referenced_noms);

-- A3. Rename RAW-FINE_SALT → canonical (if it still exists)
UPDATE nomenclature
SET product_code = 'RAW-SALT-PLAIN',
    name = 'Non-Iodized Salt',
    base_unit = 'kg'
WHERE product_code = 'RAW-FINE_SALT';

-- A4. Ensure all 3 salt types exist
INSERT INTO nomenclature (product_code, name, base_unit, type)
VALUES
  ('RAW-SALT-PLAIN',   'Non-Iodized Salt', 'kg', 'good'),
  ('RAW-SALT-IODIZED', 'Iodized Salt',     'kg', 'good'),
  ('RAW-SALT-CURING',  'Curing Salt',      'kg', 'good')
ON CONFLICT (product_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- Parts B-I: Merge duplicate pairs (safe — skip if referenced)
-- Pattern: delete FREE item, rename KEPT item to canonical name.
-- If no duplicate exists, both operations are safe no-ops.
-- ──────────────────────────────────────────────────────────────

-- COCONUT MILK: delete RAW-COCONUT-MILK (if free), rename RAW-COCONUT_MILK
DELETE FROM nomenclature WHERE product_code = 'RAW-COCONUT-MILK'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-COCONUT-MILK', name = 'Coconut Milk'
WHERE product_code = 'RAW-COCONUT_MILK';

-- CARROT: delete RAW-CARROT (if free), rename RAW-FRESH_CARROT
DELETE FROM nomenclature WHERE product_code = 'RAW-CARROT'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-CARROT', name = 'Carrot', base_unit = 'kg'
WHERE product_code = 'RAW-FRESH_CARROT';

-- GINGER: delete RAW-GINGER (if free), rename RAW-FRESH_GINGER
DELETE FROM nomenclature WHERE product_code = 'RAW-GINGER'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-GINGER', name = 'Ginger'
WHERE product_code = 'RAW-FRESH_GINGER';

-- POTATO: delete RAW-POTATO (if free), rename RAW-FRESH_POTATO
DELETE FROM nomenclature WHERE product_code = 'RAW-POTATO'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-POTATO', name = 'Potato', base_unit = 'kg'
WHERE product_code = 'RAW-FRESH_POTATO';

-- OLIVE OIL: delete RAW-OLIVE-OIL (if free), rename RAW-OLIVE_OIL
DELETE FROM nomenclature WHERE product_code = 'RAW-OLIVE-OIL'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-OLIVE-OIL', name = 'Olive Oil (Extra Virgin)', base_unit = 'L'
WHERE product_code = 'RAW-OLIVE_OIL';

-- BEETROOT: delete RAW-BEETROOT (if free), rename RAW-RAW_BEETROOT
DELETE FROM nomenclature WHERE product_code = 'RAW-BEETROOT'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-BEETROOT', name = 'Beetroot', base_unit = 'kg'
WHERE product_code = 'RAW-RAW_BEETROOT';

-- TURMERIC: delete RAW-TURMERIC (if free), rename RAW-TURMERIC_POWDER
DELETE FROM nomenclature WHERE product_code = 'RAW-TURMERIC'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-TURMERIC', name = 'Turmeric Powder'
WHERE product_code = 'RAW-TURMERIC_POWDER';

-- CABBAGE: delete RAW-CABBAGE (if free), rename RAW-WHITE_CABBAGE
DELETE FROM nomenclature WHERE product_code = 'RAW-CABBAGE'
  AND id NOT IN (SELECT id FROM _referenced_noms);
UPDATE nomenclature SET product_code = 'RAW-CABBAGE', name = 'Cabbage', base_unit = 'kg'
WHERE product_code = 'RAW-WHITE_CABBAGE';

-- ──────────────────────────────────────────────────────────────
-- Part J: Fix null base_unit
-- Uses BOTH underscore and hyphen product_codes for idempotency
-- ──────────────────────────────────────────────────────────────

UPDATE nomenclature SET base_unit = 'kg'
WHERE product_code IN (
  'RAW-GARLIC', 'RAW-ONION',
  'RAW-HERB_STEMS',    'RAW-HERB-STEMS',
  'RAW-MUSHROOM_STEMS','RAW-MUSHROOM-STEMS',
  'RAW-CABBAGE_CORES', 'RAW-CABBAGE-CORES',
  'RAW-ROOT_TRIMMINGS','RAW-ROOT-TRIMMINGS',
  'RAW-ONION_TRIMMINGS','RAW-ONION-TRIMMINGS',
  'RAW-SHISHKA_MIX',  'RAW-SHISHKA-MIX'
) AND base_unit IS NULL;

UPDATE nomenclature SET base_unit = 'L'
WHERE product_code IN (
  'RAW-LEMON_JUICE', 'RAW-LEMON-JUICE',
  'RAW-RO_WATER',    'RAW-RO-WATER'
) AND base_unit IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Part K: Standardize underscore → hyphen for remaining RAW items
-- Safe: UPDATE...WHERE only matches if old name exists
-- ──────────────────────────────────────────────────────────────

UPDATE nomenclature SET product_code = 'RAW-HERB-STEMS'       WHERE product_code = 'RAW-HERB_STEMS';
UPDATE nomenclature SET product_code = 'RAW-MUSHROOM-STEMS'   WHERE product_code = 'RAW-MUSHROOM_STEMS';
UPDATE nomenclature SET product_code = 'RAW-CABBAGE-CORES'    WHERE product_code = 'RAW-CABBAGE_CORES';
UPDATE nomenclature SET product_code = 'RAW-ROOT-TRIMMINGS'   WHERE product_code = 'RAW-ROOT_TRIMMINGS';
UPDATE nomenclature SET product_code = 'RAW-ONION-TRIMMINGS'  WHERE product_code = 'RAW-ONION_TRIMMINGS';
UPDATE nomenclature SET product_code = 'RAW-LEMON-JUICE'      WHERE product_code = 'RAW-LEMON_JUICE';
UPDATE nomenclature SET product_code = 'RAW-RO-WATER'         WHERE product_code = 'RAW-RO_WATER';
UPDATE nomenclature SET product_code = 'RAW-SHISHKA-MIX'      WHERE product_code = 'RAW-SHISHKA_MIX';
UPDATE nomenclature SET product_code = 'RAW-CORIANDER-POWDER' WHERE product_code = 'RAW-CORIANDER_POWDER';

-- Rename "Raw Pumpkin" → "Pumpkin"
UPDATE nomenclature SET name = 'Pumpkin'
WHERE product_code = 'RAW-PUMPKIN' AND name = 'Raw Pumpkin';

-- Cleanup temp table
DROP TABLE _referenced_noms;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after apply)
-- ═══════════════════════════════════════════════════════════════
-- 1. Salt entries:
--    SELECT product_code, name, base_unit FROM nomenclature
--    WHERE product_code LIKE 'RAW-SALT%' ORDER BY product_code;
--    → 3 rows: CURING, IODIZED, PLAIN
--
-- 2. No underscore RAW items:
--    SELECT product_code FROM nomenclature
--    WHERE product_code LIKE 'RAW-%' AND product_code LIKE '%\_%'
--    ORDER BY product_code;
--    → 0 rows
--
-- 3. No null base_unit on RAW items:
--    SELECT product_code, base_unit FROM nomenclature
--    WHERE product_code LIKE 'RAW-%' AND base_unit IS NULL;
--    → 0 rows
--
-- 4. BOM integrity:
--    SELECT b.id, n.product_code
--    FROM bom_structures b
--    JOIN nomenclature n ON n.id = b.ingredient_id
--    ORDER BY n.product_code;
--    → All valid, no orphans
