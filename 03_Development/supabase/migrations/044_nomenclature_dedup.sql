-- ═══════════════════════════════════════════════════════════════
-- Migration 044: Nomenclature Deduplication & Salt Taxonomy
-- Phase 6.8b: Clean up duplicate nomenclature entries
-- ═══════════════════════════════════════════════════════════════
-- CONTEXT: Migration 043 seeded ~38 RAW- items with hyphen naming,
--          but many already existed (from BOM/fn_approve_receipt) with
--          underscore naming (RAW-FRESH_CARROT, RAW-COCONUT_MILK, etc.)
--
-- STRATEGY: Keep BOM-referenced items (they have FK dependencies),
--           delete FREE duplicates (seeded in 043), then rename kept
--           items to clean canonical names.
--
-- CEO REQUEST: Salt → 3 variants: Iodized, Non-Iodized, Curing Salt
-- CEO REQUEST: Coconut Milk → single entry
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Part A: SALT — merge 3 → 1, then create CEO's 3 types
-- ──────────────────────────────────────────────────────────────
-- Current: RAW-FINE_SALT (BOM), RAW-SEA_SALT (BOM), RAW-SALT-SEA (FREE)
-- Target:  RAW-SALT-PLAIN (Non-Iodized), RAW-SALT-IODIZED, RAW-SALT-CURING

-- A1. Move BOM refs from RAW-SEA_SALT → RAW-FINE_SALT
UPDATE bom_structures
SET ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-FINE_SALT')
WHERE ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-SEA_SALT');

-- A2. Delete the two redundant salt entries
DELETE FROM nomenclature WHERE product_code = 'RAW-SALT-SEA';
DELETE FROM nomenclature WHERE product_code = 'RAW-SEA_SALT';

-- A3. Rename RAW-FINE_SALT → canonical non-iodized salt
UPDATE nomenclature
SET product_code = 'RAW-SALT-PLAIN',
    name = 'Non-Iodized Salt',
    base_unit = 'kg'
WHERE product_code = 'RAW-FINE_SALT';

-- A4. Create CEO's two additional salt types
INSERT INTO nomenclature (product_code, name, base_unit, type)
VALUES
  ('RAW-SALT-IODIZED', 'Iodized Salt', 'kg', 'good'),
  ('RAW-SALT-CURING',  'Curing Salt',  'kg', 'good')
ON CONFLICT (product_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- Part B: COCONUT MILK — merge 2 → 1
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-COCONUT_MILK (BOM), delete RAW-COCONUT-MILK (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-COCONUT-MILK';

UPDATE nomenclature
SET product_code = 'RAW-COCONUT-MILK',
    name = 'Coconut Milk'
WHERE product_code = 'RAW-COCONUT_MILK';

-- ──────────────────────────────────────────────────────────────
-- Part C: CARROT — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-FRESH_CARROT (BOM), delete RAW-CARROT (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-CARROT';

UPDATE nomenclature
SET product_code = 'RAW-CARROT',
    name = 'Carrot',
    base_unit = 'kg'
WHERE product_code = 'RAW-FRESH_CARROT';

-- ──────────────────────────────────────────────────────────────
-- Part D: GINGER — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-FRESH_GINGER (BOM), delete RAW-GINGER (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-GINGER';

UPDATE nomenclature
SET product_code = 'RAW-GINGER',
    name = 'Ginger'
WHERE product_code = 'RAW-FRESH_GINGER';

-- ──────────────────────────────────────────────────────────────
-- Part E: POTATO — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-FRESH_POTATO (BOM), delete RAW-POTATO (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-POTATO';

UPDATE nomenclature
SET product_code = 'RAW-POTATO',
    name = 'Potato',
    base_unit = 'kg'
WHERE product_code = 'RAW-FRESH_POTATO';

-- ──────────────────────────────────────────────────────────────
-- Part F: OLIVE OIL — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-OLIVE_OIL (BOM), delete RAW-OLIVE-OIL (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-OLIVE-OIL';

UPDATE nomenclature
SET product_code = 'RAW-OLIVE-OIL',
    name = 'Olive Oil (Extra Virgin)',
    base_unit = 'L'
WHERE product_code = 'RAW-OLIVE_OIL';

-- ──────────────────────────────────────────────────────────────
-- Part G: BEETROOT — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-RAW_BEETROOT (BOM), delete RAW-BEETROOT (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-BEETROOT';

UPDATE nomenclature
SET product_code = 'RAW-BEETROOT',
    name = 'Beetroot',
    base_unit = 'kg'
WHERE product_code = 'RAW-RAW_BEETROOT';

-- ──────────────────────────────────────────────────────────────
-- Part H: TURMERIC — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-TURMERIC_POWDER (BOM), delete RAW-TURMERIC (FREE)

DELETE FROM nomenclature WHERE product_code = 'RAW-TURMERIC';

UPDATE nomenclature
SET product_code = 'RAW-TURMERIC',
    name = 'Turmeric Powder'
WHERE product_code = 'RAW-TURMERIC_POWDER';

-- ──────────────────────────────────────────────────────────────
-- Part I: CABBAGE — merge, rename to canonical
-- ──────────────────────────────────────────────────────────────
-- Keep RAW-WHITE_CABBAGE (BOM), delete RAW-CABBAGE (FREE)
-- Note: RAW-CABBAGE_CORES is a waste byproduct, kept separately

DELETE FROM nomenclature WHERE product_code = 'RAW-CABBAGE';

UPDATE nomenclature
SET product_code = 'RAW-CABBAGE',
    name = 'Cabbage',
    base_unit = 'kg'
WHERE product_code = 'RAW-WHITE_CABBAGE';

-- ──────────────────────────────────────────────────────────────
-- Part J: Fix null base_unit on pre-existing items
-- ──────────────────────────────────────────────────────────────

UPDATE nomenclature SET base_unit = 'kg'
WHERE product_code IN (
  'RAW-GARLIC',
  'RAW-ONION',
  'RAW-HERB_STEMS',
  'RAW-MUSHROOM_STEMS',
  'RAW-CABBAGE_CORES',
  'RAW-ROOT_TRIMMINGS',
  'RAW-ONION_TRIMMINGS',
  'RAW-SHISHKA_MIX'
) AND base_unit IS NULL;

UPDATE nomenclature SET base_unit = 'L'
WHERE product_code IN (
  'RAW-LEMON_JUICE',
  'RAW-RO_WATER'
) AND base_unit IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Part K: Clean up product_code naming for remaining underscore items
-- ──────────────────────────────────────────────────────────────
-- Standardize to hyphen convention (RAW-HERB_STEMS → RAW-HERB-STEMS)

UPDATE nomenclature SET product_code = 'RAW-HERB-STEMS'
WHERE product_code = 'RAW-HERB_STEMS';

UPDATE nomenclature SET product_code = 'RAW-MUSHROOM-STEMS'
WHERE product_code = 'RAW-MUSHROOM_STEMS';

UPDATE nomenclature SET product_code = 'RAW-CABBAGE-CORES'
WHERE product_code = 'RAW-CABBAGE_CORES';

UPDATE nomenclature SET product_code = 'RAW-ROOT-TRIMMINGS'
WHERE product_code = 'RAW-ROOT_TRIMMINGS';

UPDATE nomenclature SET product_code = 'RAW-ONION-TRIMMINGS'
WHERE product_code = 'RAW-ONION_TRIMMINGS';

UPDATE nomenclature SET product_code = 'RAW-LEMON-JUICE'
WHERE product_code = 'RAW-LEMON_JUICE';

UPDATE nomenclature SET product_code = 'RAW-RO-WATER'
WHERE product_code = 'RAW-RO_WATER';

UPDATE nomenclature SET product_code = 'RAW-SHISHKA-MIX'
WHERE product_code = 'RAW-SHISHKA_MIX';

UPDATE nomenclature SET product_code = 'RAW-CORIANDER-POWDER'
WHERE product_code = 'RAW-CORIANDER_POWDER';

-- Rename RAW-PUMPKIN "Raw Pumpkin" → "Pumpkin" (remove redundant "Raw" prefix)
UPDATE nomenclature SET name = 'Pumpkin'
WHERE product_code = 'RAW-PUMPKIN' AND name = 'Raw Pumpkin';

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after apply)
-- ═══════════════════════════════════════════════════════════════
-- 1. Salt entries:
--    SELECT product_code, name, base_unit FROM nomenclature
--    WHERE product_code LIKE 'RAW-SALT%' ORDER BY product_code;
--    → 3 rows: CURING, IODIZED, PLAIN
--
-- 2. No more duplicates:
--    SELECT product_code, name FROM nomenclature
--    WHERE product_code LIKE 'RAW-%'
--    ORDER BY product_code;
--
-- 3. No null base_unit on RAW items:
--    SELECT product_code, name, base_unit FROM nomenclature
--    WHERE product_code LIKE 'RAW-%' AND base_unit IS NULL;
--    → 0 rows
--
-- 4. BOM integrity:
--    SELECT b.id, n.product_code, n.name
--    FROM bom_structures b
--    JOIN nomenclature n ON n.id = b.ingredient_id
--    ORDER BY n.product_code;
--    → All valid, no orphans
