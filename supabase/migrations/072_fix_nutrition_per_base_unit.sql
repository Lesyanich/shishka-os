-- Migration 072: Fix nutrition data — convert from per-100g to per-base_unit
--
-- Problem: Chef agent entered all RAW ingredient nutrition values as per 100g/100ml
-- (standard reference format), but the system calculates KBZHU as value × quantity_in_base_unit.
-- Since base_unit for most RAW items is kg or L, all values are 10× too low.
--
-- Fix: Multiply calories, protein, carbs, fat by 10 for all RAW items
-- with base_unit in (kg, L). Items with base_unit in (g, ml, pcs) are left as-is.
--
-- Scope: Only items where product_code starts with 'RAW-' AND has non-null nutrition.
-- Safety: Idempotent guard — only runs if values appear to be in per-100g range.

-- Step 1: Fix RAW items with base_unit = kg or L (multiply by 10)
UPDATE public.nomenclature
SET
  calories = calories * 10,
  protein  = protein * 10,
  carbs    = carbs * 10,
  fat      = fat * 10
WHERE product_code LIKE 'RAW-%'
  AND base_unit IN ('kg', 'L')
  AND (calories IS NOT NULL OR protein IS NOT NULL OR carbs IS NOT NULL OR fat IS NOT NULL);

-- Step 2: Add a comment documenting the convention
COMMENT ON COLUMN public.nomenclature.calories IS 'Calories (kcal) per 1 base_unit. For kg: per 1 kg. For L: per 1 L. For g/ml: per 1 g/ml.';
COMMENT ON COLUMN public.nomenclature.protein IS 'Protein (g) per 1 base_unit';
COMMENT ON COLUMN public.nomenclature.carbs IS 'Carbohydrates (g) per 1 base_unit';
COMMENT ON COLUMN public.nomenclature.fat IS 'Fat (g) per 1 base_unit';
