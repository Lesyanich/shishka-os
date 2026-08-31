-- 431_healthy_potato_tacos_name.sql
-- CEO, 2026-08-31: "healthy Potato Tacos".
--
-- Migration 428 read his "Flatbread is Healthy Tacos" as the full new name and
-- dropped the word Potato. Wrong. The line is "Healthy Potato Tacos" -- the
-- potato is the product, not decoration: the crust is the gluten-free potato
-- and rice base the whole line is built on. This corrects 428's naming and
-- nothing else.
--
-- The category CODES stay KP-FIN-MAN* for the same reason as in 428:
-- menu_public.bundle_min_price, the "taco-bundle-pool" contract assertion and
-- shishka-health lib/bundles.js all key off that literal prefix.
--
-- The DISH names are deliberately left as migration 430 set them -- 6 Cheese,
-- Za'atar, Salami, alongside Falafel, Pumpkin, Lamb, Beef. The line name lives
-- on the category and on the bundle labels; repeating it on every member is
-- what made three of the seven read differently from the other four.
--
-- CONTRACT-REVIEWED: text values on 3 product_categories rows and 3 price_tiers
-- rows. No column, view, category code, price or dish is touched. The
-- price_tiers contract resource filters on bundle_dish_code and is_active and
-- selects `label`, so the column and both rows still resolve -- only the string
-- changes. menu_public keeps its 86 rows. scripts/contract-check.mjs run
-- against both the Supabase and shishka.health endpoints after apply.

BEGIN;

UPDATE public.product_categories
   SET name = '🌮 Healthy Potato Tacos', updated_at = now()
 WHERE code = 'KP-FIN-MAN';

UPDATE public.product_categories
   SET name = '🌮 Healthy Potato Tacos · Vege', updated_at = now()
 WHERE code = 'KP-FIN-MAN-VEG';

UPDATE public.product_categories
   SET name = '🌮 Healthy Potato Tacos · Meat', updated_at = now()
 WHERE code = 'KP-FIN-MAN-MET';

UPDATE public.price_tiers
   SET label = replace(label, 'Healthy Tacos', 'Healthy Potato Tacos')
 WHERE bundle_dish_code IS NOT NULL
   AND label LIKE '%Healthy Tacos%';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '431_healthy_potato_tacos_name.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-31: "healthy Potato Tacos". Corrects migration 428, which read "Flatbread is Healthy Tacos" as the full name and dropped the word Potato. The line is Healthy Potato Tacos - the potato/rice crust is the product. Renamed KP-FIN-MAN and its Vege/Meat leaves and the price_tiers bundle labels. Category codes unchanged (bundle_min_price, the taco-bundle-pool contract assertion and shishka-health lib/bundles.js all key off the literal KP-FIN-MAN prefix). Dish names left as 430 set them - 6 Cheese, Za''atar, Salami, matching Falafel/Pumpkin/Lamb/Beef; the line name belongs to the category, not to every member.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.product_categories SET name = '🌮 Healthy Tacos'        WHERE code = 'KP-FIN-MAN';
--   UPDATE public.product_categories SET name = '🌮 Healthy Tacos · Vege' WHERE code = 'KP-FIN-MAN-VEG';
--   UPDATE public.product_categories SET name = '🌮 Healthy Tacos · Meat' WHERE code = 'KP-FIN-MAN-MET';
--   UPDATE public.price_tiers SET label = replace(label, 'Healthy Potato Tacos', 'Healthy Tacos')
--    WHERE bundle_dish_code IS NOT NULL;
-- COMMIT;
