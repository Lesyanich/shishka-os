-- 292_manakish_l1_l2_stations_dough_group_merrychef.sql
-- Manakish L1/L2 station model + dough grouping + structured Merrychef.
--
-- Context: /menu shows two cook stations. L1 (Kitchen) = batch production
-- (make dough, press, top, par-bake, blast-freeze, store). L2 (Assembly) =
-- service (pull frozen, reheat in Merrychef, plate). This migration prepares
-- the DATA so those views can split cleanly.
--
--   1. Station-tag manakish recipe steps via recipes_flow.location_id:
--        Kitchen (L1)   -> press / pre-bake / topping / blast-freeze
--        Storage        -> storage step
--        Assembly (L2)  -> Merrychef service bake
--      (Only SALE-MANAISH_ZAATAR_GF + SALE-MANAISH_CHEESE_GF have flows today;
--       SALE-MANAISH_SALAMI_GF + SALE-MANAISH_ZAATAR_CHEESE_GF have none yet —
--       follow-up to author their flows.)
--   2. Group manakish doughs + buns + crackers under a new KP-PRP-BRD
--      "Doughs & Bread" prep subcategory so L1 Cook renders them as one named
--      section (each PF card shows its full recipe inline).
--   3. Move the Merrychef service settings out of free text into structured
--      nomenclature.merrychef_program (jsonb) so L2 Assembler renders a clean
--      machine card. Mirror temp/fan/microwave onto the service step columns.
--
-- Author: chef agent · 2026-06-16 · safe (data only, no site exposure — PFs
-- never reach menu_public; KP-PRP-BRD is not is_menu_section).

BEGIN;

-- Station UUIDs (public.locations)
--   Kitchen  (L1)       1ee77261-320d-4ced-808a-8bf4abb853c7
--   Storage             0704d88e-ce5f-41a7-8b4e-f963f7b763ff
--   Assembly (L2)       816ff66b-48c9-4f2c-a428-0c3b20b60be4

-- ── 1. Station tagging on manakish recipe steps ──────────────────────────
WITH manakish AS (
  SELECT id FROM nomenclature
  WHERE product_code IN (
    'SALE-MANAISH_ZAATAR_GF', 'SALE-MANAISH_ZAATAR_CHEESE_GF',
    'SALE-MANAISH_CHEESE_GF', 'SALE-MANAISH_SALAMI_GF'
  )
)
UPDATE recipes_flow rf
SET location_id = CASE
      WHEN rf.operation_name = 'Storage'
        THEN '0704d88e-ce5f-41a7-8b4e-f963f7b763ff'::uuid   -- Storage
      WHEN rf.operation_name ILIKE 'Baking%service%'
        THEN '816ff66b-48c9-4f2c-a428-0c3b20b60be4'::uuid   -- Assembly (L2)
      ELSE '1ee77261-320d-4ced-808a-8bf4abb853c7'::uuid     -- Kitchen (L1)
    END,
    updated_at = now()
WHERE rf.nomenclature_id IN (SELECT id FROM manakish);

-- ── 2. New prep subcategory: Doughs & Bread (under KP-PRP) ────────────────
-- L3 rows require default_fin_sub_code (chk_l3_fin_sub_code); siblings use 4150.
INSERT INTO product_categories
  (id, code, name, level, parent_id, sort_order, is_menu_section, is_active, default_fin_sub_code)
VALUES
  (gen_random_uuid(), 'KP-PRP-BRD', '🫓 Doughs & Bread', 3,
   '474a4239-67ee-41b4-992b-c3ea9413c44a', 40, false, true, 4150)
ON CONFLICT (code) DO NOTHING;

UPDATE nomenclature
SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-BRD')
WHERE product_code IN (
  'PF-MANAISH_DOUGH_POTATO', 'PF-MANAISH_DOUGH_WW',
  'PF-MINI_BUN', 'PF-SEED_CRACKERS'
);

-- ── 3. Structured Merrychef service program ──────────────────────────────
-- Manakish reheat: 260°C / 1:40 / Fan 100% / Microwave 10–15%, from frozen.
UPDATE nomenclature
SET merrychef_program = jsonb_build_object(
      'temp_c',        260,
      'time_sec',      100,
      'fan_pct',       100,
      'microwave_pct', 15,
      'notes',         'Microwave 10–15%. From frozen. Serve immediately.'
    )
WHERE product_code IN (
  'SALE-MANAISH_ZAATAR_GF', 'SALE-MANAISH_ZAATAR_CHEESE_GF',
  'SALE-MANAISH_CHEESE_GF', 'SALE-MANAISH_SALAMI_GF'
);

-- Mirror onto the service step's structured columns (where a flow exists)
UPDATE recipes_flow rf
SET temperature_c = 260, fan_pct = 100, microwave_pct = 15, updated_at = now()
WHERE rf.operation_name ILIKE 'Baking%service%'
  AND rf.nomenclature_id IN (
    SELECT id FROM nomenclature WHERE product_code IN (
      'SALE-MANAISH_ZAATAR_GF', 'SALE-MANAISH_ZAATAR_CHEESE_GF',
      'SALE-MANAISH_CHEESE_GF', 'SALE-MANAISH_SALAMI_GF'
    )
  );

-- ── ledger ────────────────────────────────────────────────────────────────
INSERT INTO migration_log (filename, status, applied_by, notes)
VALUES (
  '292_manakish_l1_l2_stations_dough_group_merrychef.sql', 'success', 'chef-agent',
  'Station-tag manakish steps (Kitchen/Storage/Assembly L1/L2); new KP-PRP-BRD "Doughs & Bread" group for potato+WW dough, mini buns, seed crackers; structured Merrychef program on 4 manakish + service-step columns.'
);

COMMIT;
