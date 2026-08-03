-- 400_small_salads_section.sql
-- Half-portion salad line: new 🥗 Small Salads menu section + Fattoush & Tabbouleh at 120 THB.
--
-- CEO ask (2026-08-03): a small-portion salad line at a flat 120 THB, shown as its own
-- section in BOTH the Loyverse POS and the customer site. The section is sized to grow —
-- more salads get added to it later.
--
-- Why separate SALE- rows and not a size modifier: menu_modifiers is ADDITIVE (every option
-- is an ingredient row whose KBJU is added on top of the dish), so a "Small" option would
-- report the full portion's calories. Separate rows keep price, portion and nutrition
-- correct on every surface.
--
-- Both surfaces are data-driven from product_categories, so neither repo needs a code change:
--   site → menu_public derives the section from the nearest is_menu_section ancestor (mig 257/258)
--   POS  → loyverse-sync action='dish' files the item under the category's loyverse_category_id
--
-- Recipe = exactly 0.5x the full portion's food lines, with the 500ml bowl replacing the
-- 1300ml and a single sauce cup (the full Fattoush ships two):
--   Fattoush  small: cost 32.73 THB @ 120 = 73% margin  (full: 62.09 @ 249 = 75%)
--   Tabbouleh small: cost 40.33 THB @ 120 = 66% margin  (full: 76.01 @ 269 = 72%)
--
-- Deliberately NOT live on apply:
--   * loyverse_category_id stays NULL — filled by the owner-run Settings → Sync Categories
--     action, which is the only path that creates a category in Loyverse (the push queue
--     accepts dish/prices/names/modifiers/delete, not categories).
--   * is_web_visible = false — mig 263's explicit-publish model. Flipped once the POS side
--     is confirmed, so both surfaces go live together.
--
-- Idempotent.
--
-- CONTRACT-REVIEWED: no menu-contract surface changes. This migration only INSERTs rows —
-- it does not redefine menu_public / menu_modifiers, nor add, drop or rename any column the
-- shishka-health contract reads. customer_description / customer_ingredients / stock_state
-- appear only as values copied from the full-size parent row. Because the two new dishes carry
-- is_web_visible = false, menu_public stays at exactly its current 70 rows, so the public
-- projection is byte-identical before and after apply. contract-check.mjs green on both
-- endpoints (direct Supabase + shishka.health/sb) before apply, re-run after.

-- 1) New menu section, sibling of 🥗 Salads (sort_order 2) under Finished Dishes.
--    sort_order 3 is the free slot between Salads (2) and Sauces & Dressings (4).
INSERT INTO public.product_categories
  (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, staff_code_prefix)
SELECT
  'KP-FIN-SLD-SM', '🥗 Small Salads', 'สลัดถ้วยเล็ก',
  (SELECT id FROM public.product_categories WHERE code = 'KP-FIN'),
  3, 3,
  (SELECT default_fin_sub_code FROM public.product_categories WHERE code = 'KP-FIN-SLD'),
  true, true, 'L'
ON CONFLICT (code) DO NOTHING;

-- 2) The two half-portion dishes. Nutrition + descriptive fields are derived from the
--    full-size parent so the pair cannot drift apart at creation time.
INSERT INTO public.nomenclature (
  product_code, name, type, base_unit, category_id, price,
  portion_size, portion_unit, staff_code, display_order,
  customer_description, customer_ingredients, allergens,
  calories, protein, carbs, fat,
  storage_type, shelf_life_days, launch_phase, stock_state,
  is_available, is_featured, pos_status, is_web_visible
)
SELECT
  v.new_code,
  f.name || ' (Small)',
  'dish',
  'pcs',
  (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-SLD-SM'),
  120,
  round(f.portion_size / 2.0),
  f.portion_unit,
  v.staff_code,
  v.display_order,
  f.customer_description,
  f.customer_ingredients,
  f.allergens,
  round(f.calories / 2.0)::integer,
  round(f.protein / 2.0, 1),
  round(f.carbs   / 2.0, 1),
  round(f.fat     / 2.0, 1),
  f.storage_type,
  f.shelf_life_days,
  f.launch_phase,
  'in_stock',
  true,
  false,   -- not featured: the full-size cards already carry the feature slot
  'approved',
  false    -- published to the site in a follow-up, together with the POS go-live
FROM (VALUES
  ('SALE-FATTOUSH',  'SALE-FATTOUSH_SMALL',  'L-11', 1),
  ('SALE-TABBOULEH', 'SALE-TABBOULEH_SMALL', 'L-12', 2)
) AS v(parent_code, new_code, staff_code, display_order)
JOIN public.nomenclature f ON f.product_code = v.parent_code
ON CONFLICT (product_code) DO NOTHING;

-- 3) BOM — every food line at half quantity, carried over from the parent recipe.
--    Packaging is excluded here and re-added at small-portion sizes in step 4.
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes, slot)
SELECT
  small.id,
  b.ingredient_id,
  b.quantity_per_unit / 2.0,
  b.yield_loss_pct,
  b.notes,
  b.slot
FROM (VALUES
  ('SALE-FATTOUSH',  'SALE-FATTOUSH_SMALL'),
  ('SALE-TABBOULEH', 'SALE-TABBOULEH_SMALL')
) AS v(parent_code, small_code)
JOIN public.nomenclature parent ON parent.product_code = v.parent_code
JOIN public.nomenclature small  ON small.product_code  = v.small_code
JOIN public.bom_structures b    ON b.parent_id = parent.id
JOIN public.nomenclature ing   ON ing.id = b.ingredient_id
WHERE ing.product_code NOT IN (
  'RAW-BOWL_PAPER_1300', 'RAW-LID_PET_1300', 'RAW-SAUCE_CUP_2OZ', 'RAW-SAUCE_CUP_LID_2OZ'
)
AND NOT EXISTS (
  SELECT 1 FROM public.bom_structures x
  WHERE x.parent_id = small.id AND x.ingredient_id = b.ingredient_id
);

-- 4) Small-portion packaging: 500ml bowl + matching lid, and ONE dressing cup for both
--    dishes (the full Fattoush ships two — dressing + seed crackers).
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit, notes)
SELECT small.id, ing.id, 1, v.notes
FROM (VALUES
  ('SALE-FATTOUSH_SMALL',  'RAW-BOWL_PAPER_500',    NULL),
  ('SALE-FATTOUSH_SMALL',  'RAW-LID_PET_750',       NULL),
  ('SALE-FATTOUSH_SMALL',  'RAW-SAUCE_CUP_2OZ',     'Sumac dressing cup (served separately)'),
  ('SALE-FATTOUSH_SMALL',  'RAW-SAUCE_CUP_LID_2OZ', 'Lid for dressing cup'),
  ('SALE-TABBOULEH_SMALL', 'RAW-BOWL_PAPER_500',    NULL),
  ('SALE-TABBOULEH_SMALL', 'RAW-LID_PET_750',       NULL),
  ('SALE-TABBOULEH_SMALL', 'RAW-SAUCE_CUP_2OZ',     'Side dressing cup'),
  ('SALE-TABBOULEH_SMALL', 'RAW-SAUCE_CUP_LID_2OZ', 'Lid for side dressing cup')
) AS v(small_code, ing_code, notes)
JOIN public.nomenclature small ON small.product_code = v.small_code
JOIN public.nomenclature ing   ON ing.product_code   = v.ing_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.bom_structures x
  WHERE x.parent_id = small.id AND x.ingredient_id = ing.id
);

-- 5) Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '400_small_salads_section.sql',
  'claude-code',
  NULL,
  'New 🥗 Small Salads menu section (KP-FIN-SLD-SM, sort_order 3, is_menu_section) + SALE-FATTOUSH_SMALL / SALE-TABBOULEH_SMALL at 120 THB / 170 g, BOM = 0.5x parent food lines + 500ml bowl + single sauce cup. Data-only; site and admin pick the section up automatically. Left pos_status=approved, is_web_visible=false, loyverse_category_id NULL — go-live needs the owner Sync Categories click then a loyverse_push_queue dish push.'
)
ON CONFLICT DO NOTHING;
