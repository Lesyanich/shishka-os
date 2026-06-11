-- Migration 240: emoji column on nomenclature + populate smoothie ingredients/fruits
-- Single source of truth for an ingredient/fruit emoji, reused by the L2 cheat-sheet
-- (and later by the Loyverse modifier push). Composed with the name at render time,
-- so name stays clean. Covers RAW/PF smoothie ingredients and MOD-* fruit/add-on options.

BEGIN;

ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS emoji TEXT;

UPDATE public.nomenclature AS n
SET emoji = v.emoji
FROM (VALUES
  -- Fruits (RAW/PF ingredients)
  ('RAW-FROZEN-STRAWBERRIES',   '🍓'),
  ('PF-FROZEN_BANANA_SLICES',   '🍌'),
  ('RAW-FROZEN_MANGO_CHUNKS',   '🥭'),
  ('RAW-FROZEN-BLUEBERRIES',    '🫐'),
  ('RAW-FROZEN_KIWI',           '🥝'),
  ('RAW-FROZEN_PEACH',          '🍑'),
  ('RAW-FROZEN_APRICOT',        '🍑'),
  ('RAW-PASSION-FRUIT',         '🟣'),
  ('RAW-FROZEN_AVOCADO_HALVES', '🥑'),
  ('RAW-FROZEN_SPINACH',        '🥬'),
  ('RAW-DATES_DEGLET_NOUR',     '🌴'),
  -- Liquids / base
  ('RAW-COCONUT-MILK',          '🥥'),
  ('RAW-MILK-COW',              '🥛'),
  ('RAW-YOGURT-GREEK',          '🥣'),
  ('RAW-RO-WATER',              '💧'),
  ('RAW-ICE_CUBES',             '🧊'),
  -- Extras
  ('RAW-COCOA-POWDER',          '🍫'),
  ('RAW-CHIA-SEEDS',            '🌱'),
  ('RAW-ALMOND_SLICED',         '🌰'),
  ('RAW-PEANUT-BUTTER',         '🥜'),
  ('PF-CASHEW_BUTTER',          '🌰'),
  -- MOD-* fruit options (Pick Fruits list)
  ('MOD-STRAWBERRY',            '🍓'),
  ('MOD-BANANA',                '🍌'),
  ('MOD-MANGO',                 '🥭'),
  ('MOD-BLUEBERRY',             '🫐'),
  ('MOD-KIWI',                  '🥝'),
  ('MOD-PEACH',                 '🍑'),
  ('MOD-PASSION_FRUIT',         '🟣'),
  ('MOD-PINEAPPLE',             '🍍'),
  ('MOD-AVOCADO',               '🥑'),
  ('MOD-SPINACH',               '🥬'),
  -- MOD-* base/booster/nut options
  ('MOD-MILK_COW',              '🥛'),
  ('MOD-MILK_COCONUT',          '🥥'),
  ('MOD-GREEK_YOGURT',          '🥣'),
  ('MOD-WHEY_PROTEIN_ADD',      '💪'),
  ('MOD-CREATINE',              '⚗️'),
  ('MOD-LIONS_MANE',            '🍄'),
  ('MOD-ALMOND_SLICES',         '🌰'),
  ('MOD-CASHEW_BUTTER_ADD',     '🌰'),
  ('MOD-CHIA_SEEDS',            '🌱'),
  ('MOD-PEANUT_BUTTER_ADD',     '🥜')
) AS v(product_code, emoji)
WHERE n.product_code = v.product_code;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '240_nomenclature_emoji.sql',
  'claude-code',
  'Add nomenclature.emoji + populate smoothie ingredients and MOD-* fruit/add-on options.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
