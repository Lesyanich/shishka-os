-- 432_publish_greek_salad.sql
-- CEO, 2026-08-31: "add the greek salad to the list everywhere".
--
-- NOTHING IS BEING CREATED HERE. SALE-GREEK_SALAD already exists and is
-- finished: price 249 against a 76.37 cost (30.7% food cost, inside the 22-32%
-- house band -- the only dish touched this week that is), 237 kcal, 11.5 P /
-- 9.8 C / 17.3 F, 356 g, a photograph, an English description, an ingredient
-- line, allergens ['milk'], and it is already pushed to Loyverse
-- (pos_status='synced', item 05a63fa3-c14d-4666-b217-047980ffb76e). It sits in
-- KP-FIN-SLD at display_order 5, between Chicken Caesar and Shrimp Caesar.
-- It was simply switched off at both flags. This turns it on.
--
-- THE NAME LOSES ITS PARENTHETICAL. Every salad that is actually live reads as
-- a short name -- Fattoush Green Crunch, Chicken Caesar, Pumpkin Roots
-- Nutrition, Smoked Salmon Rose, Shrimp Caesar. The two that still carry a
-- "(ingredients)" tail -- Beetroot Walnut, Chicken & Nut -- are both unpublished
-- drafts. That parenthetical is draft style, and it matters because the printed
-- A4 menu prints nomenclature.NAME, not customer_short_name: published as-is,
-- this would be the only salad on the sheet with its recipe in its title.
-- customer_short_name is already 'Greek Salad', so the website is unaffected.
--
-- RU/TH ADDED BECAUSE THE PRINTED MENU NEEDS THEM. Every other dish on the A4
-- sheet carries a Russian and a Thai line under the English copy; this one had
-- neither and would have printed as the one English-only dish on the page.
-- These are machine translations of customer_description and are stored the
-- same way as all the others -- translation_reviewed_at stays NULL until a
-- native speaker signs them off, which is what makes build_menu.py count them
-- in its "UNREVIEWED machine translations" tally. See design/menu-a4/
-- translations.py for the convention.
--
-- TILL: queued afterwards as action='dish'. Its category (KP-FIN-SLD, 🥗 Salads)
-- already carries a loyverse_category_id and the item already lives in that
-- category on the POS, so the push cannot move it.
--
-- CONTRACT-REVIEWED: values only, on one row. No column, view or category code
-- is touched. This is the first row ADDED to menu_public since the contract was
-- last run -- 86 -> 87 -- via is_web_visible, which is the view's documented
-- publish switch. The price is 249, non-null, so no-null-price stays 0.
-- scripts/contract-check.mjs run against both the Supabase and shishka.health
-- endpoints after apply.

BEGIN;

UPDATE public.nomenclature
   SET name           = 'Greek Salad',
       is_available   = TRUE,
       is_web_visible = TRUE,
       customer_description_ru =
         'Сладкий трёхцветный болгарский перец и хрустящий огурец с чёрными '
         'оливками, тонко нарезанным шалотом и толстым ломтем греческой феты — '
         'эгейская простота, без салатных листьев и наполнителей. '
         'Содержит молочные продукты.',
       customer_description_th =
         'พริกหวานสามสีและแตงกวากรอบ กับมะกอกดำ หอมแดงซอย '
         'และเฟต้ากรีกแผ่นหนา — ความเรียบง่ายแบบทะเลอีเจียน '
         'ไม่มีผักกาดและไม่มีส่วนผสมเพิ่มปริมาณ มีส่วนผสมของนม',
       updated_at     = now()
 WHERE product_code = 'SALE-GREEK_SALAD';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '432_publish_greek_salad.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-31 "add the greek salad to the list everywhere". SALE-GREEK_SALAD already existed complete and already sits on Loyverse (pos_status=synced) - it was only switched off at is_available and is_web_visible. Both flipped true. Price 249 vs cost 76.37 = 30.7% food cost, inside the 22-32% band. Renamed "Greek Salad (Feta, Olives, Bell Pepper, Shallot)" -> "Greek Salad": the parenthetical is draft style (every live salad uses a short name, both drafts carry the tail) and the printed A4 menu prints nomenclature.name, so it would have been the only salad on the sheet with its recipe in its title. customer_short_name was already "Greek Salad" so the website is unchanged. Added machine RU/TH descriptions with translation_reviewed_at left NULL, matching the convention in design/menu-a4/translations.py - without them it would be the one English-only dish on the printed sheet. menu_public 86 -> 87 rows. Queued to the till as action=dish.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.nomenclature
--      SET name = 'Greek Salad (Feta, Olives, Bell Pepper, Shallot)',
--          is_available = FALSE, is_web_visible = FALSE,
--          customer_description_ru = NULL, customer_description_th = NULL
--    WHERE product_code = 'SALE-GREEK_SALAD';
-- COMMIT;
