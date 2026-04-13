-- Migration 125: Fix salt references in BOM
-- ═══════════════════════════════════════════════════════════════════════════════
-- RAW-FINE_SALT was removed in migration 044 (dedup), renamed to RAW-SALT-SEA
-- RAW-SALT-SEA was created in 043 but later removed/merged by 068_data_quality
-- Result: only RAW-SALT-PLAIN exists. All "sea salt" in recipes = RAW-SALT-PLAIN
--
-- This migration:
-- 1. Creates RAW-SALT-SEA (Sea Salt) as distinct from RAW-SALT-PLAIN
-- 2. Inserts missing BOM lines that reference salt
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Create RAW-SALT-SEA if it doesn't exist
INSERT INTO nomenclature (product_code, name, type, base_unit, calories, protein, carbs, fat)
VALUES ('RAW-SALT-SEA', 'Sea Salt (Fine)', 'good', 'kg', 0, 0, 0, 0)
ON CONFLICT (product_code) DO NOTHING;

-- 2. Fix BOM lines that referenced RAW-FINE_SALT (which doesn't exist)
-- These were silently skipped by the JOIN in migration 124

-- PF-BAKED_BEETROOT: sea salt 0.005 per kg
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 0.005, NULL, 'Even distribution before baking'
FROM nomenclature p, nomenclature c
WHERE p.product_code = 'PF-BAKED_BEETROOT' AND c.product_code = 'RAW-SALT-SEA'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, notes = EXCLUDED.notes;

-- PF-BAKED_PUMPKIN: sea salt 0.004 per kg
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 0.004, NULL, 'To balance natural sweetness'
FROM nomenclature p, nomenclature c
WHERE p.product_code = 'PF-BAKED_PUMPKIN' AND c.product_code = 'RAW-SALT-SEA'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, notes = EXCLUDED.notes;

-- PF-PUMPKIN_COCONUT_BASE: sea salt 0.004 per L
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 0.004, NULL, 'Fine sea salt'
FROM nomenclature p, nomenclature c
WHERE p.product_code = 'PF-PUMPKIN_COCONUT_BASE' AND c.product_code = 'RAW-SALT-SEA'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, notes = EXCLUDED.notes;

-- MOD-SOUSVIDE_CHICKEN: sea salt 0.012 per kg (1.2% dry brining)
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 0.012, NULL, '1.2% of weight — dry brining'
FROM nomenclature p, nomenclature c
WHERE p.product_code = 'MOD-SOUSVIDE_CHICKEN' AND c.product_code = 'RAW-SALT-SEA'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, notes = EXCLUDED.notes;

-- MOD-SHRIMP_SOUSVIDE: sea salt 0.01 per kg (1%)
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 0.01, NULL, '1% of weight'
FROM nomenclature p, nomenclature c
WHERE p.product_code = 'MOD-SHRIMP_SOUSVIDE' AND c.product_code = 'RAW-SALT-SEA'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, notes = EXCLUDED.notes;

-- MOD-ANCIENT_CRUNCH: salt 0.05 per kg
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, 0.05, NULL, 'Light seasoning'
FROM nomenclature p, nomenclature c
WHERE p.product_code = 'MOD-ANCIENT_CRUNCH' AND c.product_code = 'RAW-SALT-SEA'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, notes = EXCLUDED.notes;

-- Also fix: PF-PUMP_SEED_EXPRESS and PF-PUMP_SEED_SOAKED from migration 015
-- They reference RAW-FINE_SALT which doesn't exist anymore
UPDATE bom_structures SET ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-SALT-SEA')
WHERE ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-FINE_SALT')
  AND EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-FINE_SALT');
-- ^ This won't match anything since RAW-FINE_SALT doesn't exist, but safe to have

-- Also check: LIME reference in shrimp BOM (lime zest, not lime juice)
-- RAW-LIME might not exist
INSERT INTO nomenclature (product_code, name, type, base_unit, calories, protein, carbs, fat)
VALUES ('RAW-LIME', 'Lime', 'good', 'pcs', 30, 0.7, 10.5, 0.2)
ON CONFLICT (product_code) DO NOTHING;

-- Fix shrimp BOM — lime was inserted with product_code RAW-LIME
-- Verify it got in:
-- (already in 124 migration, just making sure it exists)

-- Self-register in migration_log
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('125_fix_salt_bom_refs.sql', 'Fix salt references: create RAW-SALT-SEA, fix BOM refs from non-existent RAW-FINE_SALT', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
