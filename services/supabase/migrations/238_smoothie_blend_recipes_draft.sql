-- Migration 238: draft L2 blend recipes for smoothies missing recipes_flow
-- 7 smoothies had a fixed BOM but zero process steps. These steps are
-- auto-drafted from each BOM, mirroring SALE-SMOOTHIE_CHOCO_AVO
-- (Prep -> Add liquid -> Blend -> Serve), so the L2 cheat-sheet shows a
-- usable process for every fixed smoothie. CHEF TO REVIEW / refine wording.
-- SALE-SMOOTHIE_CUSTOM intentionally excluded (build-your-own constructor).
-- All steps happen at the L2 blender station. Quantities are per portion.

BEGIN;

INSERT INTO public.recipes_flow
  (nomenclature_id, step_order, operation_name, duration_min, instruction_text, is_passive)
SELECT n.id, s.step_order, s.operation_name, s.duration_min, s.instruction_text, false
FROM (VALUES
  -- Island Green
  ('SALE-SMOOTHIE_ISLAND_GREEN', 1, 'Prep',       1, 'Add to blender cup: frozen banana 113g, kiwi 75g, spinach 60g.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 2, 'Add liquid', 1, 'Add 150ml RO water.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 3, 'Blend',      1, 'Blend on MAX 30s until smooth and bright green. If too thick, add 20-30ml water and blend 10s more.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Serve immediately.'),
  -- Mango Strawberry
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 1, 'Prep',       1, 'Add to blender cup: frozen banana 75g, mango 113g, strawberries 75g.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 2, 'Add liquid', 1, 'Add 113ml RO water.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 3, 'Blend',      1, 'Blend on MAX 30s until smooth. If too thick, add 20-30ml water and blend 10s more.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Serve immediately.'),
  -- Mixed Berry
  ('SALE-SMOOTHIE_MIXED_BERRY', 1, 'Prep',       1, 'Add to blender cup: frozen banana 75g, blueberries 60g, strawberries 90g, chia seeds 4g.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 2, 'Add liquid', 1, 'Add 188ml milk.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 3, 'Blend',      1, 'Blend on MAX 30s until smooth. If too thick, add 20-30ml milk and blend 10s more.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Serve immediately.'),
  -- Passion Mango
  ('SALE-SMOOTHIE_PASSION_MANGO', 1, 'Prep',       1, 'Add to blender cup: frozen mango 150g, passion fruit 90g.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 2, 'Add liquid', 1, 'Add 150ml RO water.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 3, 'Blend',      1, 'Blend on MAX 30s until smooth. If too thick, add 20-30ml water and blend 10s more.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Serve immediately.'),
  -- Peach Apricot
  ('SALE-SMOOTHIE_PEACH_APRICOT', 1, 'Prep',       1, 'Add to blender cup: frozen banana 75g, apricot 75g, peach 75g.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 2, 'Add liquid', 1, 'Add 75ml milk and 75g Greek yogurt.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 3, 'Blend',      1, 'Blend on MAX 30s until smooth. If too thick, add 20-30ml milk and blend 10s more.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Top with sliced almonds 8g. Serve immediately.'),
  -- Protein Peach
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 1, 'Prep',       1, 'Add to blender cup: frozen banana 75g, peach 113g, peanut butter 15g, 1 scoop whey protein (30g).'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 2, 'Add liquid', 1, 'Add 75ml milk and 75g Greek yogurt.'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 3, 'Blend',      1, 'Blend on MAX 30s until smooth, no protein lumps. If too thick, add 20-30ml milk and blend 10s more.'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Serve immediately.'),
  -- Strawberry Banana
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 1, 'Prep',       1, 'Add to blender cup: frozen banana 75g, strawberries 150g, chia seeds 4g.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 2, 'Add liquid', 1, 'Add 188ml milk.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 3, 'Blend',      1, 'Blend on MAX 30s until smooth. If too thick, add 20-30ml milk and blend 10s more.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 4, 'Serve',      1, 'Fill 400ml cup with ice (120g), pour smoothie over. Serve immediately.')
) AS s(product_code, step_order, operation_name, duration_min, instruction_text)
JOIN public.nomenclature n ON n.product_code = s.product_code
ON CONFLICT (nomenclature_id, step_order) DO NOTHING;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '238_smoothie_blend_recipes_draft.sql',
  'claude-code',
  'Draft L2 blend recipes for 7 fixed smoothies (auto-drafted from BOM, chef to review).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
