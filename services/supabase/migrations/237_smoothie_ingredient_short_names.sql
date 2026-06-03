-- Migration 237: clean customer_short_name for smoothie ingredients
-- The L2 Assembler cheat-sheet showed raw supplier SKU names
-- ("SAVEPAK Frozen Strawberry 1 kg") because customer_short_name was NULL.
-- Set short culinary labels so the assembler sees "Strawberries", "Milk", etc.
-- Only fills NULLs — never clobbers an existing curated name.

BEGIN;

UPDATE public.nomenclature AS n
SET customer_short_name = v.short_name,
    updated_at = now()
FROM (VALUES
  ('PF-CASHEW_BUTTER',          'Cashew Butter'),
  ('PF-FROZEN_BANANA_SLICES',   'Banana'),
  ('RAW-ALMOND_SLICED',         'Almonds'),
  ('RAW-CHIA-SEEDS',            'Chia Seeds'),
  ('RAW-COCOA-POWDER',          'Cocoa'),
  ('RAW-COCONUT-MILK',          'Coconut Milk'),
  ('RAW-DATES_DEGLET_NOUR',     'Dates'),
  ('RAW-FROZEN_APRICOT',        'Apricot'),
  ('RAW-FROZEN_AVOCADO_HALVES', 'Avocado'),
  ('RAW-FROZEN_KIWI',           'Kiwi'),
  ('RAW-FROZEN_MANGO_CHUNKS',   'Mango'),
  ('RAW-FROZEN_PEACH',          'Peach'),
  ('RAW-FROZEN_SPINACH',        'Spinach'),
  ('RAW-FROZEN-BLUEBERRIES',    'Blueberries'),
  ('RAW-FROZEN-STRAWBERRIES',   'Strawberries'),
  ('RAW-ICE_CUBES',             'Ice'),
  ('RAW-MILK-COW',              'Milk'),
  ('RAW-PASSION-FRUIT',         'Passion Fruit'),
  ('RAW-PEANUT-BUTTER',         'Peanut Butter'),
  ('RAW-RO-WATER',              'Water'),
  ('RAW-YOGURT-GREEK',          'Greek Yogurt'),
  ('MOD-WHEY_PROTEIN_ADD',      'Whey Protein')
) AS v(product_code, short_name)
WHERE n.product_code = v.product_code
  AND n.customer_short_name IS NULL;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '237_smoothie_ingredient_short_names.sql',
  'claude-code',
  'Set customer_short_name for smoothie ingredients so L2 cheat-sheet shows clean labels.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
