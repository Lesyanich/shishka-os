-- 429_beef_meal_back_on_sale.sql
-- CEO, 2026-08-31: "The beef meal make it 339 ... i will adjust the recipe and
-- grams later". So the food cost gets fixed from the recipe side, not the price
-- side. Price is settled at 339 (set in migration 428).
--
-- WHAT WAS ACTUALLY BLOCKING. SALE-PROTEIN_MEAL_BEEF was is_web_visible = true
-- with is_available = false -- advertised on shishka.health and not sellable.
-- That is also why its till push in 428 came back not_ready:
-- fn_loyverse_sync_dish refuses any dish with "is_available must be true", so
-- the DB and the site moved to 339 while the till still held 429. Flipping
-- is_available is what unblocks the push; the price itself is already right.
--
-- NOTHING ELSE CHANGES. The dish is already linked to Loyverse item
-- 7d4e58a3-4204-4251-b414-a653249a7e29 and its category (KP-FIN-PRM, Protein
-- Meals) carries loyverse_category_id 2809dc36-4aa5-474b-86ba-85401fc76777,
-- which is where the item already lives on the till -- so the action='dish'
-- push cannot move it between POS categories.
--
-- CONTRACT-REVIEWED: one boolean on one row. No column, view, category code or
-- price is touched. is_available is exposed by menu_public but is NOT the
-- publish gate (is_web_visible is), and this dish was already visible, so the
-- public menu keeps exactly the same 86 rows -- the only change a guest sees is
-- that the dish stops being flagged unavailable. scripts/contract-check.mjs run
-- against both the Supabase and shishka.health endpoints after apply.

BEGIN;

UPDATE public.nomenclature
   SET is_available = TRUE,
       updated_at   = now()
 WHERE product_code = 'SALE-PROTEIN_MEAL_BEEF';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '429_beef_meal_back_on_sale.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-31: put Grass-fed Beef & Eggplant Mutabal back on sale at the 339 set by migration 428. SALE-PROTEIN_MEAL_BEEF was is_web_visible=true with is_available=false - advertised on shishka.health but not sellable, and that is why its 428 till push returned not_ready (fn_loyverse_sync_dish requires is_available). Flipping it unblocks the push; price unchanged at 339. Re-queued as loyverse_push_queue action=dish. CEO will fix the 41.6% food cost from the recipe/grams side, not the price side.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.nomenclature SET is_available = FALSE
--    WHERE product_code = 'SALE-PROTEIN_MEAL_BEEF';
-- COMMIT;
-- Note: this does not pull the item off Loyverse. Queue action='delete' for
-- that, or hide it from the till in Back Office.
