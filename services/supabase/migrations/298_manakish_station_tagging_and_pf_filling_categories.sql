-- 298_manakish_station_tagging_and_pf_filling_categories.sql
-- Finish the manakish L1/L2 station model + surface manakish PF preps in L1.
--
-- Context: migs 292/293 station-tagged 4 manakish (recipes_flow.location_id →
-- locations.type: Kitchen/Storage = L1 prep, Assembly = L2 Merrychef service).
-- The other active manakish (Beef, Lamb, Cheese & Mushroom, Pumpkin × 2, …)
-- carry the SAME 6-step recipe but were left untagged, so the L2 Assembly view
-- fell back to "show all steps" and dumped the full prep recipe at the service
-- bar instead of just "pull from frozen + Merrychef".
--
-- This migration is pure DATA tagging (reversible, no schema change):
--   1. Tag the untagged manakish steps by operation_name — identical structure
--      across every manakish, verified against the 4 already-tagged ones:
--        Pressing / Pre-baking dough / Assembly / Blast Freeze -> Kitchen (L1)
--        Storage                                                -> Storage (L1)
--        Baking (service)                                       -> Assembly (L2)
--   2. Set the standard Merrychef program where missing (every untagged
--      manakish's step-6 text is identical: 260°C, 1 min 40 s, Fan 100%,
--      Microwave 10–15%, from frozen).
--   3. Categorise the manakish PF preps that had category_id = NULL so they
--      appear under L1 prep chips (instead of only the "All" bucket):
--        fillings -> Cooked Components | cheese mix -> Marinades & Mixes |
--        tortilla + starter -> Doughs & Bread.
--
-- Locations are resolved by `type` (rename-proof). Scoped to location_id IS NULL
-- / category_id IS NULL so the already-tagged 4 manakish are never touched, and
-- the migration is safe to re-run.

BEGIN;

-- 1a. L1 prep steps → Kitchen
UPDATE recipes_flow rf
SET location_id = (SELECT id FROM locations WHERE type = 'kitchen' LIMIT 1)
FROM nomenclature n
WHERE rf.nomenclature_id = n.id
  AND n.product_code LIKE 'SALE-MANAISH%'
  AND rf.location_id IS NULL
  AND rf.operation_name IN ('Pressing', 'Pre-baking dough', 'Assembly', 'Blast Freeze');

-- 1b. L1 storage step → Storage
UPDATE recipes_flow rf
SET location_id = (SELECT id FROM locations WHERE type = 'storage' LIMIT 1)
FROM nomenclature n
WHERE rf.nomenclature_id = n.id
  AND n.product_code LIKE 'SALE-MANAISH%'
  AND rf.location_id IS NULL
  AND rf.operation_name = 'Storage';

-- 1c. L2 service bake (Merrychef) → Assembly
UPDATE recipes_flow rf
SET location_id = (SELECT id FROM locations WHERE type = 'assembly' LIMIT 1)
FROM nomenclature n
WHERE rf.nomenclature_id = n.id
  AND n.product_code LIKE 'SALE-MANAISH%'
  AND rf.location_id IS NULL
  AND rf.operation_name = 'Baking (service)';

-- 2. Standard Merrychef program for manakish that have a service bake step but
--    no program yet (matches the already-tagged Za'atar: 260°C / 100 s / Fan
--    100% / MW 15%, from frozen).
UPDATE nomenclature n
SET merrychef_program = jsonb_build_object(
  'temp_c', 260,
  'time_sec', 100,
  'fan_pct', 100,
  'microwave_pct', 15,
  'notes', 'From frozen. Serve immediately.'
)
WHERE n.product_code LIKE 'SALE-MANAISH%'
  AND n.merrychef_program IS NULL
  AND EXISTS (
    SELECT 1 FROM recipes_flow rf
    WHERE rf.nomenclature_id = n.id AND rf.operation_name = 'Baking (service)'
  );

-- 3. Categorise NULL-category manakish PF preps so L1 chips surface them.
UPDATE nomenclature
SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-RCK')
WHERE product_code IN (
  'PF-MANAISH_BEEF_MEAT', 'PF-MANAISH_LAMB_MEAT', 'PF-MANAISH_SALMON_FILLING'
) AND category_id IS NULL;

UPDATE nomenclature
SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-MRN')
WHERE product_code = 'PF-CHEESE_MIX_MANAKEESH' AND category_id IS NULL;

UPDATE nomenclature
SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-BRD')
WHERE product_code IN ('PF-MANAISH-TORTILLA', 'PF-SOURDOUGH-STARTER')
  AND category_id IS NULL;

-- Ledger of record (custom migration_log; current schema = filename/applied_by/
-- status/notes). Guarded so the migration stays re-runnable.
INSERT INTO public.migration_log (filename, applied_at, applied_by, status, notes)
SELECT
  '298_manakish_station_tagging_and_pf_filling_categories.sql',
  now(),
  'claude-opus-session-cac731a2',
  'success',
  'Tag untagged manakish recipe steps by station (Kitchen/Storage=L1, Assembly=L2), set standard Merrychef program, categorise manakish PF fillings/mix/bread preps for L1 chips'
WHERE NOT EXISTS (
  SELECT 1 FROM public.migration_log
  WHERE filename = '298_manakish_station_tagging_and_pf_filling_categories.sql'
);

COMMIT;
