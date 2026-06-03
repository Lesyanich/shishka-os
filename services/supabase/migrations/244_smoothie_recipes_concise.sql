-- Migration 244: concise smoothie blend instructions
-- The first drafts (mig 238) were verbose. Shorten each step to the essentials —
-- what goes in the blender, blend time, and crucially which items are a garnish
-- (e.g. almonds) that must NOT be blended. Keeps the L2 card readable while
-- preserving the cues a cook actually needs.

BEGIN;

UPDATE public.recipes_flow AS rf
SET instruction_text = v.txt,
    updated_at = now()
FROM (VALUES
  ('SALE-SMOOTHIE_ISLAND_GREEN', 1, 'Blender: banana 113g, kiwi 75g, spinach 60g.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 2, 'Add water 150ml.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 3, 'Blend MAX ~30s until smooth.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 4, 'Pour over ice 120g in 400ml cup.'),

  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 1, 'Blender: banana 75g, mango 113g, strawberries 75g.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 2, 'Add water 113ml.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 3, 'Blend MAX ~30s until smooth.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 4, 'Pour over ice 120g in 400ml cup.'),

  ('SALE-SMOOTHIE_MIXED_BERRY', 1, 'Blender: banana 75g, blueberries 60g, strawberries 90g, chia 4g.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 2, 'Add milk 188ml.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 3, 'Blend MAX ~30s until smooth.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 4, 'Pour over ice 120g in 400ml cup.'),

  ('SALE-SMOOTHIE_PASSION_MANGO', 1, 'Blender: mango 150g, passion fruit 90g.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 2, 'Add water 150ml.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 3, 'Blend MAX ~30s until smooth.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 4, 'Pour over ice 120g in 400ml cup.'),

  ('SALE-SMOOTHIE_PEACH_APRICOT', 1, 'Blender: banana 75g, apricot 75g, peach 75g.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 2, 'Add milk 75ml + Greek yogurt 75g.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 3, 'Blend MAX ~30s until smooth.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 4, 'Pour over ice 120g; top with almonds 8g — garnish, do NOT blend.'),

  ('SALE-SMOOTHIE_PROTEIN_PEACH', 1, 'Blender: banana 75g, peach 113g, peanut butter 15g, whey 1 scoop.'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 2, 'Add milk 75ml + Greek yogurt 75g.'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 3, 'Blend MAX ~30s, no protein lumps.'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 4, 'Pour over ice 120g in 400ml cup.'),

  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 1, 'Blender: banana 75g, strawberries 150g, chia 4g.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 2, 'Add milk 188ml.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 3, 'Blend MAX ~30s until smooth.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 4, 'Pour over ice 120g in 400ml cup.')
) AS v(product_code, step_order, txt)
JOIN public.nomenclature n ON n.product_code = v.product_code
WHERE rf.nomenclature_id = n.id AND rf.step_order = v.step_order;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '244_smoothie_recipes_concise.sql',
  'claude-code',
  'Shorten smoothie recipe instructions; flag almond garnish as not-blended.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
