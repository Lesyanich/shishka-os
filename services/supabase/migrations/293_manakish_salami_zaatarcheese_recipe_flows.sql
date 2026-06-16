-- 293_manakish_salami_zaatarcheese_recipe_flows.sql
-- Author full L1/L2 recipe flows for the two manakish that had none.
--
-- SALE-MANAISH_SALAMI_GF and SALE-MANAISH_ZAATAR_CHEESE_GF had 0 recipes_flow
-- rows (mig 292 only tagged stations on the two that already had steps). They
-- are structurally identical to Za'atar / 6 Cheese — same press → pre-bake →
-- assemble → blast-freeze → store → Merrychef-service flow — only the topping
-- (step 3 Assembly) differs, per each dish's BOM.
--
-- Stations (recipes_flow.location_id):
--   Kitchen  1ee77261-320d-4ced-808a-8bf4abb853c7  (L1: steps 1-4)
--   Storage  0704d88e-ce5f-41a7-8b4e-f963f7b763ff  (step 5)
--   Assembly 816ff66b-48c9-4f2c-a428-0c3b20b60be4  (L2: step 6, Merrychef)
--
-- Author: chef agent · 2026-06-16 · idempotent (clears + re-inserts these two).

BEGIN;

-- Idempotent reset for the two target dishes only
DELETE FROM recipes_flow
WHERE nomenclature_id IN (
  SELECT id FROM nomenclature
  WHERE product_code IN ('SALE-MANAISH_SALAMI_GF', 'SALE-MANAISH_ZAATAR_CHEESE_GF')
);

-- ── Za'atar & Cheese (za'atar oil + cheese mix topping) ──────────────────
INSERT INTO recipes_flow
  (nomenclature_id, step_order, operation_name, duration_min, is_passive,
   location_id, temperature_c, fan_pct, microwave_pct, instruction_text)
SELECT n.id, v.step_order, v.operation_name, v.duration_min, v.is_passive,
       v.location_id::uuid, v.temperature_c, v.fan_pct, v.microwave_pct, v.instruction_text
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Pressing',         1,  false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL::numeric, NULL::smallint, NULL::smallint,
      'Press 30g dough portion into flat shape using press mold. Do NOT roll.'),
  (2, 'Pre-baking dough', 2,  false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL, NULL, NULL,
      'Place pressed dough on oven tray. Bake on gas range ~1 min each side (until lightly golden).'),
  (3, 'Assembly',         1,  false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL, NULL, NULL,
      'Spread za''atar + olive oil mix (RAW-ZAATAR + RAW-OLIVE-OIL) on baked dough. Top with 10g cheese mix (PF-CHEESE_MIX_MANAKEESH). Coat the BACK side with 50/50 black & white sesame seed mix.'),
  (4, 'Blast Freeze',     15, false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL, NULL, NULL,
      'Shock freeze assembled manaish in Blast Chiller until core frozen.'),
  (5, 'Storage',          0,  false, '0704d88e-ce5f-41a7-8b4e-f963f7b763ff', NULL, NULL, NULL,
      'Store frozen in aluminum cells with lids. Ready for L2 transport.'),
  (6, 'Baking (service)', 2,  false, '816ff66b-48c9-4f2c-a428-0c3b20b60be4', 260, 100, 15,
      'Merrychef: 1 min 40 sec. Fan 100%, Temperature 260°C, Microwave 10-15%. Serve immediately.')
) AS v(step_order, operation_name, duration_min, is_passive, location_id,
       temperature_c, fan_pct, microwave_pct, instruction_text)
WHERE n.product_code = 'SALE-MANAISH_ZAATAR_CHEESE_GF';

-- ── Salami (chili paste + cheese mix + salami topping) ───────────────────
INSERT INTO recipes_flow
  (nomenclature_id, step_order, operation_name, duration_min, is_passive,
   location_id, temperature_c, fan_pct, microwave_pct, instruction_text)
SELECT n.id, v.step_order, v.operation_name, v.duration_min, v.is_passive,
       v.location_id::uuid, v.temperature_c, v.fan_pct, v.microwave_pct, v.instruction_text
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Pressing',         1,  false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL::numeric, NULL::smallint, NULL::smallint,
      'Press 30g dough portion into flat shape using press mold. Do NOT roll.'),
  (2, 'Pre-baking dough', 2,  false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL, NULL, NULL,
      'Place pressed dough on oven tray. Bake on gas range ~1 min each side (until lightly golden).'),
  (3, 'Assembly',         1,  false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL, NULL, NULL,
      'Spread 10g red chili paste (PF-CHILI_PASTE) on baked dough. Top with 20g cheese mix (PF-CHEESE_MIX_MANAKEESH) and arrange 20g salami slices (RAW-SALAMI). Coat the BACK side with 50/50 black & white sesame seed mix.'),
  (4, 'Blast Freeze',     15, false, '1ee77261-320d-4ced-808a-8bf4abb853c7', NULL, NULL, NULL,
      'Shock freeze assembled manaish in Blast Chiller until core frozen.'),
  (5, 'Storage',          0,  false, '0704d88e-ce5f-41a7-8b4e-f963f7b763ff', NULL, NULL, NULL,
      'Store frozen in aluminum cells with lids. Ready for L2 transport.'),
  (6, 'Baking (service)', 2,  false, '816ff66b-48c9-4f2c-a428-0c3b20b60be4', 260, 100, 15,
      'Merrychef: 1 min 40 sec. Fan 100%, Temperature 260°C, Microwave 10-15%. Serve immediately.')
) AS v(step_order, operation_name, duration_min, is_passive, location_id,
       temperature_c, fan_pct, microwave_pct, instruction_text)
WHERE n.product_code = 'SALE-MANAISH_SALAMI_GF';

INSERT INTO migration_log (filename, status, applied_by, notes)
VALUES (
  '293_manakish_salami_zaatarcheese_recipe_flows.sql', 'success', 'chef-agent',
  'Author 6-step L1/L2 recipe flows for SALE-MANAISH_SALAMI_GF + SALE-MANAISH_ZAATAR_CHEESE_GF (were 0 steps); station-tagged Kitchen/Storage/Assembly + structured Merrychef on service step.'
);

COMMIT;
