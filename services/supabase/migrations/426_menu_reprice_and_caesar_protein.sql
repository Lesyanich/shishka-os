-- 426_menu_reprice_and_caesar_protein.sql
-- CEO, 2026-08-30: eight live dishes repriced. Two of them -- both Caesars --
-- also get more food on the plate: "protein will be double and extra 15g
-- cheese parmesan".
--
-- "EXTRA 15 g PARMESAN" IS A DOUBLING, NOT AN ADDITION OF A NEW LINE. Both
-- Caesars already carry RAW-CHEESE-PARMESAN at exactly 0.015 kg as a finishing
-- shave, on top of the parmesan already inside PF-AVOCADO_CAESAR_DRESSING.
-- 0.015 -> 0.030 is the whole change. There is no second cheese line to add,
-- and the dressing is untouched.
--
-- "PROTEIN WILL BE DOUBLE" reads onto one line per dish:
--   chicken  PF-CHICKEN_GRILL_TAWOOK   0.100 -> 0.200 kg
--   shrimp   PF-SHRIMP_MARINATED_FZ    1 -> 2 portions, i.e. 6 -> 12 pcs
-- Nothing else on either plate moves. Lettuce, croutons, tomato, dressing and
-- packaging are all unchanged: he doubled the protein, not the salad.
--
-- THE SHRIMP PRICE IS THE ONE NUMBER THAT CHANGED IN CONVERSATION. He first
-- said 250. A second shrimp portion costs 33.22 THB, so 220 -> 250 would have
-- taken food cost from 30.3% to 43.4% -- a price rise that loses money per
-- cover. Shown that, he moved it to 339, which lands on 32.0% and holds the
-- line. This is the only figure in this migration that is not verbatim from
-- the original brief.
--
-- WHICH "HUMMUS" GETS 149. The brief said "eggs sandwiches 149 hummus 159
-- giugamole 159 cheese eggs your way 159", which is ambiguous because the
-- Dips section and the Eggs section both have a 169 hummus. CEO ruled: "egg
-- hummus is 149 not hummus dip". So 149 lands on SALE-BRK_DOUBLE_PROTEIN
-- (hummus + smashed egg) and SALE-HUMMUS_PLAIN in Dips is NOT touched --
-- it stays 169 and is deliberately absent from this migration.
--
-- COSTS ARE READ FROM nomenclature.cost_per_unit, WHICH IS THE HONEST NUMBER.
-- It reconciles to the fen on both dishes against the sum of their BOM lines
-- (Chicken: 8.7957+12.798+0.4+5.18+8.535+2.288+5.625+2.58 = 46.2017 exactly).
-- The shishka-chef MCP's get_bom_tree disagrees (54.35 for the chicken) because
-- it re-derives PF-CROUTONS_HERB from its child recipe at ~426/kg instead of
-- using the stored 20.00/kg. The 20.00 is deliberate -- croutons are made from
-- leftover bread, which is why they are nearly free -- and migration 421 says
-- so in as many words. Do not "correct" it; it would silently inflate every
-- Caesar and the Hummus Protein Boost.
--
-- MARGIN, STATED PLAINLY AND ACCEPTED BY CEO. Three of the eight sit outside
-- the 22-32% house band once this lands:
--   Iron Kebab Hummus   44.6%  (was ALREADY 38.5% at 220 -- pre-existing, and
--                               the beef SKU correction flagged on be0c9433
--                               would push it further)
--   Melted Cheese & Egg 37.8%  (was already 35.6%)
--   Chicken Caesar      35.5%
-- Two more are marginal: Guacamole Smashed Egg 33.4%, Double Protein 32.6%.
-- To hold 32% you would need Chicken Caesar 211 and Iron Kebab 265. CEO chose
-- the listed prices with those numbers in front of him. Logged once on MC
-- bc5e688c, not re-litigated here.
--
-- PORTION SIZES. Chicken is exact: +100 g chicken +15 g cheese = 415 -> 530 g.
-- Shrimp is rounded: the second PF-SHRIMP_MARINATED_FZ portion is ~33.5 g of
-- edible shrimp (0.067 kg head-on at 50% loss) plus ~8 g of clinging marinade,
-- so 400 + ~42 + 15 rounds to 450 g. Flagged rather than hidden: if the shrimp
-- portion is ever weighed properly this is the line to revisit.
--
-- WEB + POS. All eight rows are is_available/is_web_visible true and
-- pos_status synced, so menu_public picks the new prices up with no deploy.
-- The till does NOT update from this migration -- Loyverse needs an
-- action='dish' push per item, queued separately after apply.
--
-- CONTRACT-REVIEWED: values only, no columns or view definitions touched. This
-- updates price/portion_size/quantity_per_unit on rows menu_public already
-- exposes; it adds and removes no dishes, and leaves every price non-null.
-- scripts/contract-check.mjs green on both the Supabase and shishka.health
-- endpoints after apply (87 rows, no-null-price 0, all named pools intact).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Chicken Caesar: double the tawook, double the parmesan shave
-- ---------------------------------------------------------------------------
UPDATE public.bom_structures b
   SET quantity_per_unit = v.qty,
       notes = 'CEO 2026-08-30: double protein + extra 15 g parmesan (mig 426)'
  FROM public.nomenclature d, public.nomenclature i,
       (VALUES ('PF-CHICKEN_GRILL_TAWOOK', 0.200::numeric),
               ('RAW-CHEESE-PARMESAN',     0.030::numeric)) AS v(code, qty)
 WHERE b.parent_id = d.id
   AND b.ingredient_id = i.id
   AND d.product_code = 'SALE-CAESAR_CHICKEN'
   AND i.product_code = v.code;

-- ---------------------------------------------------------------------------
-- 2. Shrimp Caesar: 6 -> 12 shrimp, double the parmesan shave
-- ---------------------------------------------------------------------------
UPDATE public.bom_structures b
   SET quantity_per_unit = v.qty,
       notes = 'CEO 2026-08-30: double protein + extra 15 g parmesan (mig 426)'
  FROM public.nomenclature d, public.nomenclature i,
       (VALUES ('PF-SHRIMP_MARINATED_FZ', 2::numeric),
               ('RAW-CHEESE-PARMESAN',    0.030::numeric)) AS v(code, qty)
 WHERE b.parent_id = d.id
   AND b.ingredient_id = i.id
   AND d.product_code = 'SALE-CAESAR_SHRIMP'
   AND i.product_code = v.code;

-- ---------------------------------------------------------------------------
-- 3. Replate the two Caesars
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature SET portion_size = 530, updated_at = now()
 WHERE product_code = 'SALE-CAESAR_CHICKEN';

UPDATE public.nomenclature SET portion_size = 450, updated_at = now()
 WHERE product_code = 'SALE-CAESAR_SHRIMP';

-- ---------------------------------------------------------------------------
-- 4. The eight prices
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature n
   SET price = v.new_price,
       updated_at = now()
  FROM (VALUES
    ('SALE-CAESAR_CHICKEN',      190::numeric),  -- 170, + double chicken + 15 g parmesan
    ('SALE-CAESAR_SHRIMP',       339::numeric),  -- 220, + double shrimp  + 15 g parmesan
    ('SALE-SUMMER_ROLLS_VEGGIE', 149::numeric),  -- 169
    ('SALE-BRK_DOUBLE_PROTEIN',  149::numeric),  -- 169, the "egg hummus", NOT the dip
    ('SALE-BRK_GUACAMOLE_EGG',   159::numeric),  -- 169
    ('SALE-BRK_CHEESE_EGG',      159::numeric),  -- 169
    ('SALE-BRK_EGGS_YOUR_WAY',   159::numeric),  -- 169
    ('SALE-TOAST_KEBAB',         190::numeric)   -- 220, "Iron Kebab Hummus"
  ) AS v(code, new_price)
 WHERE n.product_code = v.code;

-- ---------------------------------------------------------------------------
-- 5. Roll the two changed recipes up
--
-- Scoped to the two Caesars on purpose. These functions gate on
-- is_available = TRUE (both are true, so they run) and a blanket rollup would
-- reach dishes this migration has no business touching.
-- ---------------------------------------------------------------------------
SELECT public.fn_rollup_bom_costs(id), public.fn_rollup_bom_nutrition(id)
  FROM public.nomenclature
 WHERE product_code IN ('SALE-CAESAR_CHICKEN', 'SALE-CAESAR_SHRIMP');

-- ---------------------------------------------------------------------------
-- 6. Register
-- ---------------------------------------------------------------------------
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '426_menu_reprice_and_caesar_protein.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-30 reprice of 8 live dishes. Both Caesars also doubled protein and doubled the 15 g parmesan shave to 30 g: chicken tawook 0.1->0.2 kg (COGS 46.20->67.53, 27.2%->35.5% at 170->190), shrimp 1->2 portions i.e. 6->12 pcs (COGS 66.63->108.38, 30.3%->32.0% at 220->339). Shrimp price moved off the briefed 250 to 339 in session: a second shrimp portion costs 33.22 so 250 would have meant 43.4% FC. Price-only: Veggie Rice Paper Rolls 169->149, Double Protein 169->149, Guacamole Smashed Egg 169->159, Melted Cheese & Egg 169->159, Eggs Your Way 169->159, Iron Kebab Hummus 220->190. CEO ruled the 149 is the egg hummus (SALE-BRK_DOUBLE_PROTEIN), NOT the Dips hummus - SALE-HUMMUS_PLAIN untouched at 169. Accepted out-of-band food cost: Iron Kebab 44.6% (was already 38.5%), Melted Cheese & Egg 37.8% (was 35.6%), Chicken Caesar 35.5%. Portions 415->530 g and 400->450 g. Loyverse needs a separate action=dish push per item.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.bom_structures b SET quantity_per_unit = v.qty
--     FROM public.nomenclature d, public.nomenclature i,
--          (VALUES ('SALE-CAESAR_CHICKEN','PF-CHICKEN_GRILL_TAWOOK',0.100::numeric),
--                  ('SALE-CAESAR_CHICKEN','RAW-CHEESE-PARMESAN',    0.015::numeric),
--                  ('SALE-CAESAR_SHRIMP', 'PF-SHRIMP_MARINATED_FZ', 1::numeric),
--                  ('SALE-CAESAR_SHRIMP', 'RAW-CHEESE-PARMESAN',    0.015::numeric)
--          ) AS v(dish, code, qty)
--    WHERE b.parent_id = d.id AND b.ingredient_id = i.id
--      AND d.product_code = v.dish AND i.product_code = v.code;
--   UPDATE public.nomenclature n SET price = v.old_price
--     FROM (VALUES ('SALE-CAESAR_CHICKEN',170::numeric),('SALE-CAESAR_SHRIMP',220::numeric),
--                  ('SALE-SUMMER_ROLLS_VEGGIE',169::numeric),('SALE-BRK_DOUBLE_PROTEIN',169::numeric),
--                  ('SALE-BRK_GUACAMOLE_EGG',169::numeric),('SALE-BRK_CHEESE_EGG',169::numeric),
--                  ('SALE-BRK_EGGS_YOUR_WAY',169::numeric),('SALE-TOAST_KEBAB',220::numeric)
--          ) AS v(code, old_price)
--    WHERE n.product_code = v.code;
--   UPDATE public.nomenclature SET portion_size = 415 WHERE product_code = 'SALE-CAESAR_CHICKEN';
--   UPDATE public.nomenclature SET portion_size = 400 WHERE product_code = 'SALE-CAESAR_SHRIMP';
--   SELECT public.fn_rollup_bom_costs(id), public.fn_rollup_bom_nutrition(id)
--     FROM public.nomenclature WHERE product_code IN ('SALE-CAESAR_CHICKEN','SALE-CAESAR_SHRIMP');
-- COMMIT;
