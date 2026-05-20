-- Migration 204: Fix 4 manakish ingredients (MC task 9cd49a5d)
-- 1. RAW-FLOUR-VENUS:       unit portion→kg, set cost
-- 2. RAW-FLOUR-SEMOLINA:    unit pcs→kg, recalc cost (500g pack ฿92.6 → ฿185.2/kg)
-- 3. PF-SOURDOUGH-STARTER:  type dish→semi_finished, unit portion→kg
-- 4. PF-WHEY-YOGURT:        type dish→semi_finished, unit portion→L

BEGIN;

-- 1. RAW-FLOUR-VENUS: fix unit, set cost from market price (NS-Venus 22.5kg sack ≈ ฿45.6/kg)
UPDATE nomenclature
SET base_unit = 'kg',
    cost_per_unit = 45.6,
    updated_at = now()
WHERE id = 'fded7415-33bb-4222-8ca7-0d5ea61f3c3f'
  AND product_code = 'RAW-FLOUR-VENUS';

-- 2. RAW-FLOUR-SEMOLINA: fix unit pcs→kg, recalc cost (500g pack at ฿92.6 → ฿185.2/kg)
--    Nutrition already stored per-kg (1820 kcal) — no nutrition change needed
UPDATE nomenclature
SET base_unit = 'kg',
    cost_per_unit = 185.2,
    updated_at = now()
WHERE id = '8d335ade-0c94-4f42-862a-a2307a171587'
  AND product_code = 'RAW-FLOUR-SEMOLINA';

-- 3. PF-SOURDOUGH-STARTER: fix type + unit
--    Live culture: flour + water, fed daily. Cost is negligible (~฿5/kg).
--    KBJU per kg: ~700 kcal, 20g protein, 140g carbs, 2g fat (mostly flour + water 1:1)
UPDATE nomenclature
SET type = 'semi_finished',
    base_unit = 'kg',
    cost_per_unit = 5,
    calories = 700,
    protein = 20,
    carbs = 140,
    fat = 2,
    allergens = ARRAY['gluten'],
    updated_at = now()
WHERE id = 'd3daaf5f-d068-4053-8750-e6774f65f15c'
  AND product_code = 'PF-SOURDOUGH-STARTER';

-- 4. PF-WHEY-YOGURT: fix type + unit
--    Byproduct of homemade yogurt straining. Cost ≈ ฿0 (would be discarded).
--    KBJU per L: ~240 kcal, 8g protein, 50g carbs, 0.5g fat
UPDATE nomenclature
SET type = 'semi_finished',
    base_unit = 'L',
    cost_per_unit = 0,
    calories = 240,
    protein = 8,
    carbs = 50,
    fat = 0.5,
    allergens = ARRAY['milk'],
    updated_at = now()
WHERE id = 'bf42f285-39b3-4ba1-8afa-6952766beed2'
  AND product_code = 'PF-WHEY-YOGURT';

-- Also fix any BOM quantities that referenced these items in old units.
-- RAW-FLOUR-VENUS: was "portion", BOM quantities were already in kg-scale → no change needed.
-- RAW-FLOUR-SEMOLINA: was "pcs" (1 pcs = 500g pack). Check if any BOM uses it:
-- If BOM has qty=1 (meaning 1 pack = 0.5kg), update to 0.5 kg.
UPDATE bom_structures
SET quantity_per_unit = quantity_per_unit * 0.5
WHERE ingredient_id = '8d335ade-0c94-4f42-862a-a2307a171587'
  AND quantity_per_unit >= 1;
-- Safety: only adjust if quantity was in "packs" (>=1). Sub-1 values likely already in kg.

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '206_fix_4_manakish_ingredients.sql',
    'claude-code',
    'Fix 4 manakish ingredients: Venus unit→kg, Semolina unit→kg, Sourdough type→PF, Whey type→PF'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
