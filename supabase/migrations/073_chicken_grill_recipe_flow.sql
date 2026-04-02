-- Migration 073: Production flow for PF-CHICKEN_GRILL_NEUTRAL
-- 5 steps, total 67 min, uses Lava Grill + Manual prep station

INSERT INTO public.recipes_flow (
  product_code, step_order, operation_name, equipment_id,
  expected_duration_min, instruction_text, notes
)
VALUES
  (
    'PF-CHICKEN_GRILL_NEUTRAL', 1, 'Prep & Butterfly',
    '5e0faa74-898d-40a7-a77d-7d5a723f6429',  -- Manual (no equipment)
    10,
    'Butterfly chicken breasts: cut horizontally leaving one side attached, open flat. Pat dry with paper towels. Score surface lightly for better marinade absorption.',
    'Use cutting board + knife set. Ensure uniform thickness ~1.5cm for even grilling.'
  ),
  (
    'PF-CHICKEN_GRILL_NEUTRAL', 2, 'Marination',
    '5e0faa74-898d-40a7-a77d-7d5a723f6429',  -- Manual (no equipment)
    30,
    'Combine olive oil, crushed garlic, lemon juice, salt, pepper, and thyme. Coat chicken evenly. Place in GN pan, cover with lid. Refrigerate minimum 30 min.',
    'Can marinate up to 4h in advance. GN 1/1 pan fits ~5kg of butterflied breasts.'
  ),
  (
    'PF-CHICKEN_GRILL_NEUTRAL', 3, 'Preheat Grill',
    'b42833b2-84a5-4843-a525-748be58ec52a',  -- Lava Grill Gas
    10,
    'Preheat lava grill to high heat (~250°C). Clean grates with grill brush. Lightly oil grates.',
    'Grill must be fully preheated for proper sear marks.'
  ),
  (
    'PF-CHICKEN_GRILL_NEUTRAL', 4, 'Grilling',
    'b42833b2-84a5-4843-a525-748be58ec52a',  -- Lava Grill Gas
    12,
    'Place butterflied chicken presentation-side down. Grill 5-6 min until char marks appear. Flip once. Continue 5-6 min until internal temp reaches 74°C. Do not press or move during cooking.',
    'Lava grill capacity: ~2kg per batch. For 4kg target, run 2 batches.'
  ),
  (
    'PF-CHICKEN_GRILL_NEUTRAL', 5, 'Rest & Portion',
    '5e0faa74-898d-40a7-a77d-7d5a723f6429',  -- Manual (no equipment)
    5,
    'Transfer to clean cutting board. Rest 3-5 minutes. Slice or portion as needed. Weigh total output. Transfer to GN pan for storage or immediate use.',
    'Resting prevents juice loss. Target yield: ~77% of raw weight.'
  );

-- Also fix missing nutrition for RAW-THYME (per 1 kg, values from USDA)
UPDATE public.nomenclature
SET
  calories = 1010,   -- 101 kcal/100g × 10
  protein  = 56,     -- 5.6 g/100g × 10
  carbs    = 245,    -- 24.5 g/100g × 10
  fat      = 17      -- 1.7 g/100g × 10
WHERE product_code = 'RAW-THYME'
  AND calories IS NULL;
