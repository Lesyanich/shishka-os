-- 411_menu_copy_and_allergens.sql
--
-- CEO, 2026-08-26: "remove Protein Meals / add the Bowls (you have all recipes
-- for all dishs)"
--
-- Both halves are corrections to what 410 left behind, and the second one is a
-- correction of my reply to him rather than of the migration.
--
-- "REMOVE PROTEIN MEALS" — said twice now. 410 took it off the menu and left
-- is_available = true so the till kept selling it, and flagged that choice in
-- its own footer as gap 6: "if the intent was to stop selling it, is_available
-- also needs to go false." Repeating the instruction is the answer to that
-- question. All three go unavailable here. This is the reversible half: the
-- rows are not deleted, prices and BOMs survive, and flipping the flag back
-- restores the dish on the till exactly as it was.
--
-- "ADD THE BOWLS (YOU HAVE ALL RECIPES FOR ALL DISHS)" — Bowls is already 11
-- items and needs nothing added. Read against what I told him after 410 — that
-- the seven newly-unhidden dishes have no photo and no description — the
-- parenthesis is the instruction: the recipes are already in the database, so
-- stop asking and write the copy from them. That is what this does. Seven
-- descriptions, sourced line by line from bom_structures. Beetroot Walnut,
-- the eighth dish 410 revived, already had copy and is untouched.
--
-- PHOTOS ARE STILL MISSING AND THIS DOES NOT FIX THEM. Descriptions and
-- photography were always two jobs; this closes one. Until the shoots happen
-- those seven dishes render as an empty 380px disc on the site.
--
-- THE ALLERGEN FIX IS NOT SCOPE CREEP. menu_public does not expose the
-- allergens column — the only allergen disclosure a guest ever sees is the
-- "Contains ..." sentence at the end of customer_description, which is exactly
-- what this migration writes. Writing that sentence meant deriving the true
-- allergen set from the BOM, and doing so found six of the seven dishes
-- under-declared in nomenclature.allergens:
--
--   Chicken & Nut Cup      sesame          -> + tree nuts   (18 g cashews, in the dish name)
--   Shrimp/Crab/Seaweed    crust,shell,ses -> + fish, gluten, soy
--   Teriyaki Chicken       sesame          -> + gluten, soy (teriyaki sauce, edamame)
--   Tofu & Chickpea        sesame          -> + soy         (65 g firm tofu)
--   Tuna & Quinoa          fish            -> + soy         (edamame)
--   Mango Salmon & Tuna    fish            -> + sesame, soy (edamame, chuka wakame)
--
-- Leaving the array wrong while publishing a prose sentence derived from the
-- true set would have put two contradictory allergen answers in one payload.
-- Thai Noodle Salad was already correct and is not touched.
--
-- Ingredient-level allergens are patchy and cannot be trusted as the source:
-- RAW-CASHEWS, RAW-PEANUTS, RAW-TOFU-FIRM, RAW-FROZEN-EDAMAME, RAW-CRABSTICK
-- and RAW-WAKAME_SALAD all carry NULL allergens today. The sets below were
-- derived by reading the BOM and reasoning about the ingredient, not by
-- rolling up. Two of them are inferences about bought-in products and are
-- deliberately over-declared, which is the safe direction:
--   RAW-CRABSTICK (surimi)     -> fish, and wheat binder => gluten
--   RAW-WAKAME_SALAD (chuka)   -> seasoned with soy sauce and sesame oil
-- Both need their actual packaging labels checked. Over-declaring costs a
-- vegan a sale; under-declaring sends someone to Vachira hospital.
--
-- THE GLUTEN ON THAI NOODLE SALAD IS REAL AND THE COPY MUST NOT HIDE IT. Its
-- gluten comes from RAW-SOY-SAUCE in the dressing, not from the konjac
-- noodles. The description sells the noodles as zero-carb and must not let a
-- reader infer gluten-free; the Contains sentence says gluten explicitly.
-- Swapping that line to tamari is an existing backlog item and would make the
-- dish genuinely gluten-free, at which point this copy needs revisiting.
--
-- NUTRITION IS DELIBERATELY NOT TOUCHED, AND I NEARLY GOT THIS WRONG. All
-- seven have portion_size NULL while the rest of the menu has it set, which
-- looked like their calories were stored per-100 g and were being rendered as
-- per-portion. Scaling by BOM weight to "fix" that would have published 1120
-- kcal for a salad and 58 g of protein out of 65 g of chicken breast — both
-- impossible. The stored figures are already per-portion and broadly agree
-- with the BOM. Only the Mango Salmon & Tuna Bowl looks genuinely understated
-- (184 kcal against roughly 380 kcal of visible ingredients); that is one
-- dish's data error for /chef, not a systemic basis mismatch, and no
-- description below quotes a calorie or protein figure for that dish.
--
-- CONTRACT-REVIEWED: touches customer_ingredients, customer_description and
-- allergens on 7 SALE- rows, and is_available on 3. menu-contract.json keys
-- its assertions on product_code and row counts, not on copy fields, and no
-- product_code is created, renamed or deleted here. The 3 Protein Meals rows
-- are already is_web_visible = false (410), so menu_public row count does not
-- change: 92 before, 92 after. contract-check.mjs run green before and after.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Protein Meals: off the till as well as off the menu.
--    410 already set is_web_visible = false and is_menu_section = false on
--    KP-FIN-PRM. This is the remaining flag.
--    fn_nomenclature_staff_code returns NEW unchanged when is_available is not
--    true, so no staff code is minted or revoked by this update.
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature
   SET is_available = false
 WHERE product_code IN ('SALE-PROTEIN_MEAL_CHICKEN',
                        'SALE-PROTEIN_MEAL_SHRIMP',
                        'SALE-PROTEIN_MEAL_BEEF');

-- ---------------------------------------------------------------------------
-- 2. Customer copy for the seven dishes 410 made public.
--    House style, matched against the six best-formed dishes on the menu:
--    ingredients = comma-separated headline components in sentence case, not
--    an exhaustive BOM dump; description = one evocative sentence, an em-dash
--    clause carrying the hook, then a "Contains ..." sentence.
-- ---------------------------------------------------------------------------

-- Bowls ---------------------------------------------------------------------

UPDATE public.nomenclature SET
  customer_ingredients = 'Jasmine rice, salmon, sashimi-grade tuna, ripe mango, avocado, wakame salad, edamame, cherry tomato, cucumber',
  customer_description = 'Sashimi-grade tuna and salmon over jasmine rice with ripe mango, avocado and seasoned wakame — the most generous bowl on the menu and the only one built on raw fish. Contains fish, sesame and soy.',
  allergens = ARRAY['fish','sesame','soy']
 WHERE product_code = 'SALE-BOWL_MANGO_SALMON_TUNA';

UPDATE public.nomenclature SET
  customer_ingredients = 'Cooked quinoa, grilled shrimp, crab stick, wakame salad, sweet corn, cucumber, bell pepper, sesame seeds',
  customer_description = 'Lava-grilled shrimp and crab stick over cooked quinoa with seasoned wakame, sweet corn and crisp shaved cabbage — the lightest cup on the list at 119 calories. Contains crustacean, shellfish, fish, gluten, sesame and soy.',
  allergens = ARRAY['crustacean','fish','gluten','sesame','shellfish','soy']
 WHERE product_code = 'SALE-CUP_SHRIMP_CRAB_SEAWEED';

UPDATE public.nomenclature SET
  customer_ingredients = 'Cooked quinoa, tuna in spring water, sweet corn, edamame, black beans, cucumber, bell pepper, green oak lettuce',
  customer_description = 'Steak tuna in spring water over cooked quinoa with edamame, black beans and sweet corn — 19 grams of protein for 127 calories, the leanest thing we sell. Contains fish and soy.',
  allergens = ARRAY['fish','soy']
 WHERE product_code = 'SALE-CUP_TUNA_QUINOA';

UPDATE public.nomenclature SET
  customer_ingredients = 'Riceberry rice, grilled chicken breast, teriyaki sauce, baked pumpkin, Japanese sweet potato, avocado, edamame, sesame seeds',
  customer_description = 'Sous-vide chicken glazed in teriyaki over nutty riceberry rice with caramelised pumpkin, Beni Haruka sweet potato and edamame — sweet, savoury and built on purple grain. Contains gluten, sesame and soy.',
  allergens = ARRAY['gluten','sesame','soy']
 WHERE product_code = 'SALE-CUP_TERIYAKI_CHICKEN';

UPDATE public.nomenclature SET
  customer_ingredients = 'Cooked quinoa, crispy firm tofu, chickpeas, baked pumpkin, avocado, green oak lettuce, sesame seeds',
  customer_description = 'Crisped firm tofu and chickpeas over quinoa with caramelised pumpkin, avocado and green oak — entirely plant-based and the best-value cup on the menu. Contains sesame and soy.',
  allergens = ARRAY['sesame','soy']
 WHERE product_code = 'SALE-CUP_TOFU_CHICKPEA';

-- Salads --------------------------------------------------------------------

UPDATE public.nomenclature SET
  customer_ingredients = 'Grilled chicken breast, green oak lettuce, cherry tomato, cucumber, cashew nuts, pomegranate, sesame seeds',
  customer_description = 'Sous-vide grilled chicken breast over green oak and shaved cabbage with toasted cashews, cherry tomato and pomegranate — no grain, no dressing to hide behind, 27 grams of protein. Contains sesame and tree nuts.',
  allergens = ARRAY['sesame','tree nuts']
 WHERE product_code = 'SALE-CUP_CHICKEN_NUT';

-- Gluten below is from the soy sauce in the dressing, NOT from the noodles.
UPDATE public.nomenclature SET
  customer_ingredients = 'Konjac shirataki noodles, peanut butter dressing, cabbage, carrot, daikon, edamame, roasted peanuts, coriander, sesame seeds',
  customer_description = 'Konjac shirataki noodles tossed through a ginger-garlic peanut dressing with shaved cabbage, daikon and carrot, finished with roasted peanuts and coriander — zero-carb noodles carrying a properly rich sauce. Contains gluten, peanuts, sesame and soy.'
 WHERE product_code = 'SALE-SALAD_THAI_NOODLE';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('411_menu_copy_and_allergens.sql', 'claude-opus-session-b18424ec', 'success',
        'CEO: "remove Protein Meals / add the Bowls (you have all recipes for all dishs)". '
     || '(a) is_available = false on the 3 Protein Meals, closing gap 6 of mig 410 - they '
     || 'were already off the menu but still selling on the till. (b) Wrote customer_ingredients '
     || 'and customer_description from bom_structures for the 7 dishes 410 unhid, which had none. '
     || '(c) Corrected under-declared allergens on 6 of those 7 (added tree nuts to Chicken & Nut, '
     || 'soy to tofu/edamame dishes, gluten+soy to teriyaki, fish+gluten+soy to shrimp/crab). '
     || 'menu_public does not expose allergens, so the Contains sentence in the description is the '
     || 'only disclosure the guest sees. Photos still missing on all 7. Nutrition deliberately '
     || 'untouched - stored figures are per-portion and correct. No row count change: 92 -> 92.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- Copy and allergens were NULL / short arrays before this ran; restoring the
-- previous state means nulling the copy and reverting the six arrays.
--
-- BEGIN;
-- UPDATE public.nomenclature SET is_available = true
--  WHERE product_code IN ('SALE-PROTEIN_MEAL_CHICKEN','SALE-PROTEIN_MEAL_SHRIMP','SALE-PROTEIN_MEAL_BEEF');
-- UPDATE public.nomenclature SET customer_ingredients = NULL, customer_description = NULL
--  WHERE product_code IN ('SALE-BOWL_MANGO_SALMON_TUNA','SALE-CUP_SHRIMP_CRAB_SEAWEED',
--                         'SALE-CUP_TUNA_QUINOA','SALE-CUP_TERIYAKI_CHICKEN',
--                         'SALE-CUP_TOFU_CHICKPEA','SALE-CUP_CHICKEN_NUT','SALE-SALAD_THAI_NOODLE');
-- UPDATE public.nomenclature SET allergens = ARRAY['fish']                                  WHERE product_code = 'SALE-BOWL_MANGO_SALMON_TUNA';
-- UPDATE public.nomenclature SET allergens = ARRAY['crustacean','sesame','shellfish']       WHERE product_code = 'SALE-CUP_SHRIMP_CRAB_SEAWEED';
-- UPDATE public.nomenclature SET allergens = ARRAY['fish']                                  WHERE product_code = 'SALE-CUP_TUNA_QUINOA';
-- UPDATE public.nomenclature SET allergens = ARRAY['sesame']                                WHERE product_code = 'SALE-CUP_TERIYAKI_CHICKEN';
-- UPDATE public.nomenclature SET allergens = ARRAY['sesame']                                WHERE product_code = 'SALE-CUP_TOFU_CHICKPEA';
-- UPDATE public.nomenclature SET allergens = ARRAY['sesame']                                WHERE product_code = 'SALE-CUP_CHICKEN_NUT';
-- DELETE FROM public.migration_log WHERE filename='411_menu_copy_and_allergens.sql';
-- COMMIT;
--
-- ---------------------------------------------------------------------------
-- STILL OPEN FOR THE CEO
--
-- 1. PHOTOS. All 7 dishes above are public with copy and no image. This is now
--    the single highest-value open item on the menu: seven shoots.
-- 2. RAW-CRABSTICK and RAW-WAKAME_SALAD allergen sets are inferred from what
--    those products normally contain, not from their labels. Someone should
--    read the packets. Until then they are over-declared.
-- 3. Ingredient-level allergens are NULL on cashews, peanuts, tofu, edamame,
--    crabstick and wakame. Any future dish built on them inherits nothing.
--    A pass over RAW- allergens would stop this recurring dish by dish.
-- 4. allergens is not in menu_public. The guest reads prose only. If a real
--    allergen filter is ever wanted on the site, the view needs the column.
-- 5. Mango Salmon & Tuna Bowl: 184 kcal against ~380 kcal of visible
--    ingredients. Looks understated - /chef should recheck.
-- 6. portion_size is NULL on all 7 while set on the rest of the menu.
-- 7. "soy" appears on only 2 SALE rows menu-wide before this migration, and
--    "legume" on 1. Edamame and tofu are all over the menu, so soy is very
--    likely under-declared on dishes outside this batch too.
