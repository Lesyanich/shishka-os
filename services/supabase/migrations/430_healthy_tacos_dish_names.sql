-- 430_healthy_tacos_dish_names.sql
-- CEO, 2026-08-31: "i need all the changes we did reflect on menu".
--
-- Migration 428 renamed the LINE to Healthy Tacos but left three DISH names
-- carrying the old line name inside them:
--     SALE-MANAISH_CHEESE_GF   "6 Cheese Potato Tacos"
--     SALE-MANAISH_ZAATAR_GF   "Za'atar Potato Tacos"
--     SALE-MANAISH_SALAMI_GF   "Salami Potato Tacos"
-- That was judged cosmetic at the time because shishka.health reads
-- customer_short_name (already clean: "Cheese", "Za'atar", "Salami"), so the
-- website never showed it.
--
-- IT IS NOT COSMETIC. The printed A4 menu (design/menu-a4/build_menu.py) reads
-- menu_public.NAME, not customer_short_name -- so the PDF was still printing
-- "Potato Tacos" three times under a line the CEO has renamed. That is the
-- surface the guest actually holds.
--
-- The suffix is dropped rather than swapped for "Healthy Tacos" because the
-- other four members of the line carry no suffix at all -- Falafel, Pumpkin,
-- Lamb, Beef. The group name belongs to the category, not repeated on every
-- member. This makes the seven read as one set.
--
-- TILL: queued afterwards as loyverse_push_queue action='names'. That action
-- moves the name only -- it cannot touch price or POS category.
--
-- CONTRACT-REVIEWED: three text values on three rows. No column, view,
-- category code or price is touched. The names do not begin with '[ARCHIVED]'
-- before or after, so the menu_public row filter is unaffected and the view
-- keeps exactly its 86 rows. scripts/contract-check.mjs run against both the
-- Supabase and shishka.health endpoints after apply.

BEGIN;

UPDATE public.nomenclature SET name = '6 Cheese', updated_at = now()
 WHERE product_code = 'SALE-MANAISH_CHEESE_GF';

UPDATE public.nomenclature SET name = 'Za''atar', updated_at = now()
 WHERE product_code = 'SALE-MANAISH_ZAATAR_GF';

UPDATE public.nomenclature SET name = 'Salami', updated_at = now()
 WHERE product_code = 'SALE-MANAISH_SALAMI_GF';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '430_healthy_tacos_dish_names.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-31 "all the changes reflected on the menu". Dropped the stale "Potato Tacos" suffix from the 3 dish names that still carried it: SALE-MANAISH_CHEESE_GF -> "6 Cheese", SALE-MANAISH_ZAATAR_GF -> "Za''atar", SALE-MANAISH_SALAMI_GF -> "Salami". Left out of 428 as cosmetic because shishka.health reads customer_short_name, but the printed A4 menu generator reads menu_public.name so the PDF was still printing the old line name. Suffix dropped, not swapped, because the other 4 members of the line (Falafel, Pumpkin, Lamb, Beef) carry no suffix - the group name belongs to the category. Queued to the till as action=names.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.nomenclature SET name = '6 Cheese Potato Tacos'  WHERE product_code = 'SALE-MANAISH_CHEESE_GF';
--   UPDATE public.nomenclature SET name = 'Za''atar Potato Tacos'  WHERE product_code = 'SALE-MANAISH_ZAATAR_GF';
--   UPDATE public.nomenclature SET name = 'Salami Potato Tacos'    WHERE product_code = 'SALE-MANAISH_SALAMI_GF';
-- COMMIT;
