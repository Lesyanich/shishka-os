-- 415_toasts_one_slice_and_cheaper.sql
--
-- CEO: "Toasts lets do it 1 pice and reduce the prices"
--
-- Three live toasts go to a single slice of 19-grain bread and drop in price.
-- The fourth toast in the section, SALE-TOAST_EGG_HUMMUS, is deliberately NOT
-- touched: it is dormant (is_web_visible=false, is_available=false) and it is a
-- CLOSED sandwich, where the second slice is the lid, not a portion size.
--
--
-- TWO OF THE THREE WERE ALREADY ONE SLICE IN THE KITCHEN.
--
-- assembler_note on SALE-TOAST_SHRIMP_GUACAMOLE and SALE-TOAST_SALMON_GOAT_CHEESE
-- both read "OPEN face, ONE slice, NOT cut (CEO 2026-08-01)". That ruling landed
-- 25 days ago and only the assembler note was updated with it. The BOM still
-- carried 0.103 kg of bread (= 2 slices; cf. SALE-TOAST_19GRAIN_2 at 0.103 kg
-- against SALE-TOAST_19GRAIN_1 at 0.0515 kg), the price never moved, and the
-- customer_description still opened with "x2 toasts". So for those two dishes
-- this migration is a CORRECTION: it makes the recipe, the price and the guest
-- copy agree with what the counter has been plating since 1 August.
--
-- Only SALE-SANDWICH_MEATLOAF_MELT is a genuine change of portion today. Its
-- note still says "2 slices, OPEN face, each becomes a square -> cut each
-- diagonally = 4 triangles total", so it really was going out as two.
--
--
-- WHY THE TOPPINGS MOVE TOO, AND ONLY WHERE THEY SHOULD.
--
-- Meatloaf Melt: the meat and both cheeses were spread across two open squares.
-- On one square, 40 g meatloaf under 70 g of melted cheese is not a sandwich,
-- it is a cheese slide. Scaled down with the bread.
--
-- Smoked Salmon Toast: guacamole 190 -> 120 g, trout 60 -> 40 g, goat cheese
-- 50 -> 30 g. This one is cut on purpose and it is the only dish here whose
-- portion genuinely shrinks. See the margin note below.
--
-- Shrimp & Guacamole Toast: guacamole stays at 190 g. It is already being
-- mounded on a single slice today, so trimming it would take food off a plate
-- the guest is already receiving. Bread only.
--
--
-- MARGINS AT THE NEW PRICES (food cost only; none of these three carry
-- packaging lines, so all three are a further ~7.76 THB light if they are ever
-- sold to take away in a bowl and lid).
--
--   Ham Meatloaf Melt        289 -> 199   cost 86.94 -> 54.71   27.5%
--   Shrimp & Guacamole Toast 349 -> 270   cost 96.41 -> 82.24   30.5%
--   Smoked Salmon Toast      399 -> 349   cost 183.51 -> 113.83  32.6%
--
-- The salmon toast is the one to keep an eye on. It sits at 32.6%, outside the
-- 21-31% band, and that is AFTER cutting three of its six lines. Its problem is
-- structural: 40 g smoked trout at 1038 THB/kg plus 30 g goat cheese at 1245
-- THB/kg is 78.87 THB of premium protein on one slice of bread. At the old 399
-- with the old portions it was running at 46%, so this is a large improvement,
-- but the dish will not reach 30% while it carries two luxury proteins. The
-- lever that would fix it, if the CEO wants it: drop the goat cheese entirely
-- (-37.35) and the dish costs 76.48, which supports a 249 price at 30.7%.
-- Logged, not acted on - the goat cheese is named in the dish title.
--
--
-- COPY. All three customer_descriptions opened with "x2 toasts -" / "x2 Toasts
-- -". That prefix is now false on the menu and on shishka.health, so it is
-- stripped. The Meatloaf Melt's assembler_note is rewritten from 4 triangles to
-- 2. The two notes that already said "ONE slice" are left exactly as they are -
-- they were right all along.
--
-- Nutrition (calories/protein/carbs/fat) recalculates itself: bom_structures
-- carries trg_cascade_bom_nutrition_on_bom, and cost_per_unit recalculates via
-- trg_bom_structure_cost_cascade -> fn_rollup_bom_costs. This migration
-- therefore sets quantities and prices only, and never writes cost_per_unit.
--
-- Prices are set directly rather than through fn_set_dish_price:
-- trg_guard_nomenclature_price only raises for auth.role() = 'authenticated'
-- that is not the owner, and a migration runs as the migration role.
--
-- CONTRACT-REVIEWED: no row enters or leaves menu_public - all three dishes
-- keep is_web_visible=true, keep their category, and keep a non-null price, so
-- the dishes-present and no-null-price assertions are unaffected. The
-- spring-rolls-section, taco-bundle-pool, free-sauce-pool and coffee-split
-- assertions look at other product_code/category prefixes entirely.
--
-- ROLLBACK at the foot of the file.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. One slice of bread instead of two, on the three OPEN toasts.
--    0.103 kg -> 0.0515 kg. Egg & Hummus is excluded on purpose (closed).
-- ---------------------------------------------------------------------------
UPDATE public.bom_structures b
   SET quantity_per_unit = 0.0515
  FROM public.nomenclature parent, public.nomenclature ing
 WHERE b.parent_id = parent.id
   AND b.ingredient_id = ing.id
   AND ing.product_code = 'RAW-BREAD_CUBIC_19GRAIN'
   AND parent.product_code IN ('SALE-SANDWICH_MEATLOAF_MELT',
                               'SALE-TOAST_SHRIMP_GUACAMOLE',
                               'SALE-TOAST_SALMON_GOAT_CHEESE');

-- ---------------------------------------------------------------------------
-- 2. Meatloaf Melt: the filling was built for two squares. Scale it to one.
-- ---------------------------------------------------------------------------
UPDATE public.bom_structures b
   SET quantity_per_unit = v.qty
  FROM public.nomenclature parent, public.nomenclature ing,
       (VALUES ('RAW-MEATLOAF_SLICED',        0.030),
               ('RAW-CHEESE-CHEDDAR_SLICED',  0.025),
               ('RAW-CHEESE-EMMENTAL',        0.020)) AS v(code, qty)
 WHERE b.parent_id = parent.id
   AND b.ingredient_id = ing.id
   AND ing.product_code = v.code
   AND parent.product_code = 'SALE-SANDWICH_MEATLOAF_MELT';

-- ---------------------------------------------------------------------------
-- 3. Smoked Salmon Toast: the only real portion cut in this migration.
--    Guacamole and both proteins come down so the price can come down.
-- ---------------------------------------------------------------------------
UPDATE public.bom_structures b
   SET quantity_per_unit = v.qty
  FROM public.nomenclature parent, public.nomenclature ing,
       (VALUES ('RAW-SMOKED_TROUT',  0.040),
               ('RAW-CHEESE_GOAT',   0.030),
               ('PF-GUACAMOLE',      0.120)) AS v(code, qty)
 WHERE b.parent_id = parent.id
   AND b.ingredient_id = ing.id
   AND ing.product_code = v.code
   AND parent.product_code = 'SALE-TOAST_SALMON_GOAT_CHEESE';

-- Shrimp & Guacamole Toast keeps PF-GUACAMOLE at 0.190 on purpose: it is
-- already mounded on a single slice today. Bread only. No statement here.

-- ---------------------------------------------------------------------------
-- 4. Prices.
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature n
   SET price = v.price
  FROM (VALUES ('SALE-SANDWICH_MEATLOAF_MELT',   199::numeric),
               ('SALE-TOAST_SHRIMP_GUACAMOLE',   270::numeric),
               ('SALE-TOAST_SALMON_GOAT_CHEESE', 349::numeric)) AS v(code, price)
 WHERE n.product_code = v.code;

-- ---------------------------------------------------------------------------
-- 5. Guest copy: the "x2 toasts" prefix is no longer true.
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature
   SET customer_description = 'Oven-toasted open sandwich on 19-grain bread: melted cheddar, meatloaf, onion and tomato under a blanket of emmental.'
 WHERE product_code = 'SALE-SANDWICH_MEATLOAF_MELT';

UPDATE public.nomenclature
   SET customer_description = 'Grilled shrimp over a thick layer of guacamole on toasted 19-grain bread, topped with fresh pico de gallo and mango salsa, with a squeeze of lemon.'
 WHERE product_code = 'SALE-TOAST_SHRIMP_GUACAMOLE';

UPDATE public.nomenclature
   SET customer_description = 'Cold smoked salmon trout over guacamole and goat cheese on toasted 19-grain bread, finished with dill and a squeeze of lemon.'
 WHERE product_code = 'SALE-TOAST_SALMON_GOAT_CHEESE';

-- ---------------------------------------------------------------------------
-- 6. Assembler note for the one dish whose plating actually changes.
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature
   SET assembler_note = '1 slice, OPEN face, becomes a square -> cut diagonally = 2 triangles.'
 WHERE product_code = 'SALE-SANDWICH_MEATLOAF_MELT';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('415_toasts_one_slice_and_cheaper.sql', 'claude-opus-session-b18424ec', 'success',
        'Toasts to a single slice of 19-grain bread and cheaper: Meatloaf Melt 289->199, Shrimp & Guacamole 349->270, Smoked Salmon 399->349. Shrimp and Salmon were already plated as one slice per CEO 2026-08-01 - their BOM, price and "x2 toasts" copy had never caught up. Meatloaf filling scaled with the bread; salmon toast trout/goat/guacamole cut so its price could move. Egg & Hummus untouched (dormant, closed sandwich).')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- Restores the two-slice recipes, the old prices and the old copy. Note this
-- also restores the "x2 toasts" prefix and the 2-slice assembler note on the
-- Meatloaf Melt, which is correct: they described the two-slice dish.
-- It does NOT restore the pre-2026-08-01 state of the shrimp and salmon
-- assembler notes, because those already said ONE slice before this migration.
--
-- BEGIN;
--   UPDATE public.bom_structures b SET quantity_per_unit = 0.103
--     FROM public.nomenclature parent, public.nomenclature ing
--    WHERE b.parent_id = parent.id AND b.ingredient_id = ing.id
--      AND ing.product_code = 'RAW-BREAD_CUBIC_19GRAIN'
--      AND parent.product_code IN ('SALE-SANDWICH_MEATLOAF_MELT',
--                                  'SALE-TOAST_SHRIMP_GUACAMOLE',
--                                  'SALE-TOAST_SALMON_GOAT_CHEESE');
--
--   UPDATE public.bom_structures b SET quantity_per_unit = v.qty
--     FROM public.nomenclature parent, public.nomenclature ing,
--          (VALUES ('RAW-MEATLOAF_SLICED',       0.040),
--                  ('RAW-CHEESE-CHEDDAR_SLICED', 0.040),
--                  ('RAW-CHEESE-EMMENTAL',       0.030)) AS v(code, qty)
--    WHERE b.parent_id = parent.id AND b.ingredient_id = ing.id
--      AND ing.product_code = v.code
--      AND parent.product_code = 'SALE-SANDWICH_MEATLOAF_MELT';
--
--   UPDATE public.bom_structures b SET quantity_per_unit = v.qty
--     FROM public.nomenclature parent, public.nomenclature ing,
--          (VALUES ('RAW-SMOKED_TROUT', 0.060),
--                  ('RAW-CHEESE_GOAT',  0.050),
--                  ('PF-GUACAMOLE',     0.190)) AS v(code, qty)
--    WHERE b.parent_id = parent.id AND b.ingredient_id = ing.id
--      AND ing.product_code = v.code
--      AND parent.product_code = 'SALE-TOAST_SALMON_GOAT_CHEESE';
--
--   UPDATE public.nomenclature n SET price = v.price
--     FROM (VALUES ('SALE-SANDWICH_MEATLOAF_MELT',   289::numeric),
--                  ('SALE-TOAST_SHRIMP_GUACAMOLE',   349::numeric),
--                  ('SALE-TOAST_SALMON_GOAT_CHEESE', 399::numeric)) AS v(code, price)
--    WHERE n.product_code = v.code;
--
--   UPDATE public.nomenclature SET
--     customer_description = '×2 Toasts — Oven Toasted Open Sandwich on 19-Grain Bread: Melted Cheddar, Meatloaf, Onion and Tomato Under a Blanket of Emmental.',
--     assembler_note = '2 slices, OPEN face, each becomes a square -> cut each diagonally = 4 triangles total.'
--    WHERE product_code = 'SALE-SANDWICH_MEATLOAF_MELT';
--
--   UPDATE public.nomenclature SET
--     customer_description = '×2 toasts — Grilled shrimp over a thick layer of guacamole on toasted 19-grain bread, topped with fresh pico de gallo and mango salsa, with a squeeze of lemon.'
--    WHERE product_code = 'SALE-TOAST_SHRIMP_GUACAMOLE';
--
--   UPDATE public.nomenclature SET
--     customer_description = '×2 toasts — Cold smoked salmon trout over guacamole and goat cheese on toasted 19-grain bread, finished with dill and a squeeze of lemon.'
--    WHERE product_code = 'SALE-TOAST_SALMON_GOAT_CHEESE';
--
--   DELETE FROM public.migration_log WHERE filename = '415_toasts_one_slice_and_cheaper.sql';
-- COMMIT;
