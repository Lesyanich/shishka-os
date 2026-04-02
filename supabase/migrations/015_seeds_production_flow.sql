-- Migration 015: Seeds Production Flow
-- Goal: Seed nomenclature, BOM, and recipes_flow for pumpkin seed toppings.
-- NOTE: All labels and instructions are in English as requested.

-- 1. Seed nomenclature nodes (idempotent: ON CONFLICT DO NOTHING)
INSERT INTO public.nomenclature (product_code, name, type, base_unit)
VALUES
  ('RAW-PUMPKIN_SEEDS', 'Pumpkin Seeds (Raw)', 'good', 'kg'),
  ('RAW-SUMAC', 'Sumac (Ground)', 'good', 'kg'),
  ('PF-PUMP_SEED_EXPRESS', 'Pumpkin Seeds Express', 'dish', 'kg'),
  ('PF-PUMP_SEED_SOAKED', 'Pumpkin Seeds Soaked', 'dish', 'kg'),
  ('MOD-ROASTED_PUMPKIN_SEEDS', 'Roasted Pumpkin Seeds Topping', 'modifier', 'kg')
ON CONFLICT (product_code) DO NOTHING;

-- Ensure standard_output for PF nodes where missing
UPDATE public.nomenclature
SET standard_output_qty = 1,
    standard_output_uom = 'kg'
WHERE product_code IN ('PF-PUMP_SEED_EXPRESS', 'PF-PUMP_SEED_SOAKED')
  AND (standard_output_qty IS NULL OR standard_output_uom IS NULL);

-- 2. BOM structures for PF nodes
-- Reuse existing raw nodes for oil and salt where available
WITH ids AS (
  SELECT
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMP_SEED_EXPRESS') AS pf_express_id,
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMP_SEED_SOAKED') AS pf_soaked_id,
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-PUMPKIN_SEEDS') AS raw_seeds_id,
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-SUMAC') AS raw_sumac_id,
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-OLIVE_OIL') AS raw_oil_id,
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-FINE_SALT') AS raw_salt_id
)
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT
  pf_express_id,
  raw_seeds_id,
  1.0,
  NULL,
  'Pumpkin seeds base'
FROM ids
UNION ALL
SELECT
  pf_express_id,
  raw_oil_id,
  0.02,
  NULL,
  'Oil for express marinade'
FROM ids
UNION ALL
SELECT
  pf_express_id,
  raw_salt_id,
  0.01,
  NULL,
  'Fine salt'
FROM ids
UNION ALL
SELECT
  pf_express_id,
  raw_sumac_id,
  0.015,
  NULL,
  'Sumac seasoning'
FROM ids
UNION ALL
SELECT
  pf_soaked_id,
  raw_seeds_id,
  1.0,
  NULL,
  'Pumpkin seeds base (soaked)'
FROM ids
UNION ALL
SELECT
  pf_soaked_id,
  raw_oil_id,
  0.025,
  NULL,
  'Oil after activation'
FROM ids
UNION ALL
SELECT
  pf_soaked_id,
  raw_salt_id,
  0.01,
  NULL,
  'Fine salt for soak and seasoning'
FROM ids
UNION ALL
SELECT
  pf_soaked_id,
  raw_sumac_id,
  0.02,
  NULL,
  'Sumac for soaked profile'
FROM ids
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- 3. Production flow (recipes_flow) for PF nodes
-- Equipment identifiers are reused from existing pumpkin flows:
-- - prep_station_id: 5e0faa74-898d-40a7-a77d-7d5a723f6429   -- Manual prep / mixing
-- - oven_unit_20_id: 5eed3d0e-9f48-4502-8c6e-3f49bfe7926f   -- Unit 20 (Oven)

WITH eq AS (
  SELECT
    '5e0faa74-898d-40a7-a77d-7d5a723f6429'::text AS prep_station_id,
    '5eed3d0e-9f48-4502-8c6e-3f49bfe7926f'::text AS oven_unit_20_id
)
INSERT INTO public.recipes_flow (
  product_code,
  step_order,
  operation_name,
  equipment_id,
  expected_duration_min,
  instruction_text,
  notes
)
-- PF-PUMP_SEED_EXPRESS
SELECT
  'PF-PUMP_SEED_EXPRESS',
  1,
  'Marination',
  eq.prep_station_id,
  5,
  'Combine pumpkin seeds with oil, salt, and sumac. Mix until evenly coated.',
  'Express marinade before roasting.'
FROM eq
UNION ALL
SELECT
  'PF-PUMP_SEED_EXPRESS',
  2,
  'Roasting',
  eq.oven_unit_20_id,
  12,
  'Roast on Unit 20 at 150°C for 10–12 minutes, convection 100%. Shake tray once halfway.',
  'Unit 20 (Convection 100%).'
FROM eq
UNION ALL
-- PF-PUMP_SEED_SOAKED
SELECT
  'PF-PUMP_SEED_SOAKED',
  1,
  'Activation Soak',
  eq.prep_station_id,
  480,
  'Cover pumpkin seeds with lightly salted water and soak for 8 hours at +4°C.',
  'Activation soak for better digestion.'
FROM eq
UNION ALL
SELECT
  'PF-PUMP_SEED_SOAKED',
  2,
  'Rinse & Dry',
  eq.prep_station_id,
  10,
  'Rinse soaked seeds, then spin-dry in salad spinner until surface moisture is removed.',
  'Use salad spinner or perforated tray.'
FROM eq
UNION ALL
SELECT
  'PF-PUMP_SEED_SOAKED',
  3,
  'Marination',
  eq.prep_station_id,
  5,
  'Toss activated seeds with oil, salt, and sumac until evenly coated.',
  'Same marinade profile as express version.'
FROM eq
UNION ALL
SELECT
  'PF-PUMP_SEED_SOAKED',
  4,
  'Roasting',
  eq.oven_unit_20_id,
  18,
  'Roast on Unit 20 at 160°C for 15–18 minutes, convection 100%. Rotate trays if needed.',
  'Unit 20 (Convection 100%).'
FROM eq;

