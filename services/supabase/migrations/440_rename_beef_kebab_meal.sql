-- 440_rename_beef_kebab_meal.sql
-- CEO 2026-09-08: "change the name Grass-Fed Beef & Eggplant Mutabal to Grass-Fed Beef Kebab
--                  and the image <drive folder> and description / change it everywhere"
--
-- SALE-PROTEIN_MEAL_BEEF, 339 THB, live on shishka.health and on the till.
--
-- THIS IS NOT A RECIPE CHANGE. It is the customer-facing half of a reformulation that already
-- happened in the BOM and was never written down on the menu. Migration 437 called it out in
-- its own header and logged it rather than fixing it:
--
--     "NAME/BOM DRIFT, also logged: the dish names promise sides the recipes do not contain.
--      ... 'Grass-fed Beef & eggplant Mutabal' has no PF-MUTABAL_BASE -- all three meals carry
--      plain PF-HUMMUS_BASE plus tomato/cucumber ... the menu wording is describing a
--      different dish."
--
-- The BOM (rebuilt 2026-08-08, MC 153b22f4) is PF-KEBAB_BEEF_SLAB_FZ x2 + PF-HUMMUS_BASE 80 g
-- + PF-TAHINI_DRESSING 50 g + tomato/cucumber/gherkin 40 g each + RAW-WRAP_WHOLEGRAIN 45 g.
-- No mutabal. No fattoush. Not sliced beef -- kebab.
--
-- The stored nutrition already describes THAT plate, which is how we know the drift is in the
-- wording and not in the numbers: rolling the BOM by hand gives ~750 kcal / 58.6 g protein
-- against the stored 758 / 58.4. So calories, protein, portion_size, price and allergens are
-- all deliberately UNTOUCHED here -- they were already correct for the kebab plate. Only the
-- three fields a guest reads are wrong, and this migration fixes exactly those three.
--
-- ALLERGEN CORRECTION, and the reason this is worth doing carefully rather than as a rename:
-- the old description ends "Contains dairy, gluten and sesame". There is no dairy in the BOM.
-- The dairy was the yogurt in the mutabal, and the mutabal left the dish. The allergens[] array
-- has said {gluten,sesame} all along, so the printed sentence and the structured field have been
-- contradicting each other on an allergen. The new text says gluten and sesame, matching
-- allergens[]. Over-declaring is the safe direction of the two, but a guest who reads "contains
-- dairy" and orders around it is being given false information either way.
--
-- THE PHOTO. New Drive asset "Beef Kebab Meal.png" (1HCbAhN6mLt2nZXCerUt3541T_483syBR), shot
-- 2026-09-08, already resized to 1080 px WebP q80 with alpha and uploaded to
-- nomenclature-photos/8654ec3e-.../menu-1HCbAhN6mLt2nZXCerUt3541T_483syBR.webp per the standing
-- pipeline. menu_photo_map is repointed below so the photo can still be rebuilt from Drive.
-- The old asset (1YsXcR1lSw...) stays in the bucket; nothing is deleted, so this is reversible
-- by resetting two columns.
--
-- ONE THING THE PHOTO DOES THAT THE TEXT MUST NOT: it shows a bowl of RICE where the BOM has the
-- tomato/cucumber salad. That is not an error -- migration 437 made "Swap the salad for" a free
-- modifier list (rice / brown rice / baked potato / buckwheat, all priced 0), so the shot is a
-- legal configuration of the dish, just not the default one. The description therefore names the
-- salad as the plate it ships with and mentions the swap explicitly, so the picture and the
-- words agree without the text promising rice to someone who did not ask for it. Note the swap
-- is till-only (437 wrote no nomenclature_modifier_options rows), so a web order cannot select
-- it -- the sentence says it is available, not that the site can take it.
--
-- CONTRACT-REVIEWED: values only, no shape change. Four text columns on ONE existing
--   nomenclature row plus one menu_photo_map row. No column is added, dropped or retyped; no
--   row enters or leaves menu_public, which must still read 86 after apply (87 before mig 439
--   retired the meatloaf melt). is_web_visible, price, calories, protein, portion_size and
--   allergens are all untouched, so every numeric field the contract exposes is bit-identical.
--   contract-check.mjs green against the direct Supabase endpoint and https://shishka.health/sb.
BEGIN;

-- 1. The three fields a guest reads ------------------------------------------------------
UPDATE public.nomenclature
SET name                    = 'Grass-Fed Beef Kebab',
    customer_short_name     = 'Grass-Fed Beef Kebab',
    customer_description    = 'Two skewers of spiced grass-fed beef kebab on warm flatbread '
                              'with parsley and sumac red onion, served with silky hummus, a '
                              'tomato-cucumber salad and tahini sauce — 58 grams of protein on '
                              'one plate. The salad or the hummus swaps for rice, brown rice, '
                              'baked potato or buckwheat at no charge. Contains gluten and sesame.',
    customer_ingredients    = 'Grass-fed beef kebab, flatbread, parsley, red onion with sumac, '
                              'hummus, tomato and cucumber salad, pickled gherkins, tahini sauce',
    customer_description_ru = 'Два шампура пряного кебаба из говядины травяного откорма на тёплой '
                              'лепёшке с петрушкой и красным луком в сумахе, с нежным хумусом, '
                              'салатом из томатов и огурцов и соусом тахини — 58 г белка на одной '
                              'тарелке. Салат или хумус можно бесплатно заменить на рис, бурый '
                              'рис, печёный картофель или гречку.',
    image_url               = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/'
                              'nomenclature-photos/8654ec3e-89f6-4bff-a9ad-18f568b64d31/'
                              'menu-1HCbAhN6mLt2nZXCerUt3541T_483syBR.webp?v=1788885978555',
    updated_at              = now()
WHERE id = '8654ec3e-89f6-4bff-a9ad-18f568b64d31';

-- 2. Re-sync ledger ----------------------------------------------------------------------
-- PK is nomenclature_id (one photo per dish), so this repoints rather than accumulating.
-- Without it the dish still renders, but the photo can no longer be rebuilt from Drive.
INSERT INTO public.menu_photo_map (nomenclature_id, drive_id)
VALUES ('8654ec3e-89f6-4bff-a9ad-18f568b64d31', '1HCbAhN6mLt2nZXCerUt3541T_483syBR')
ON CONFLICT (nomenclature_id) DO UPDATE SET drive_id = EXCLUDED.drive_id;

-- 3. Carry the new name to the till ------------------------------------------------------
-- Loyverse shows nomenclature.name, so the till would keep reading "Grass-fed Beef & eggplant
-- Mutabal" until it is pushed. Queued rather than called directly because loyverse-sync rejects
-- the service-role key; pg_cron drains this. Guarded on loyverse_item_id so a second run of the
-- migration cannot double-queue, and on the item actually existing on the till.
INSERT INTO public.loyverse_push_queue (action, target_id, status, requested_by)
SELECT 'dish', n.id, 'pending', 'migration-440'
FROM public.nomenclature n
WHERE n.id = '8654ec3e-89f6-4bff-a9ad-18f568b64d31'
  AND n.loyverse_item_id IS NOT NULL
  AND NOT EXISTS (
        SELECT 1 FROM public.loyverse_push_queue q
         WHERE q.target_id = n.id
           AND q.action = 'dish'
           AND q.status = 'pending'
      );

-- 4. Self-register in migration_log (RULE-MIGRATION-TRACKING) -----------------------------
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '440_rename_beef_kebab_meal.sql',
  'CEO 2026-09-08. SALE-PROTEIN_MEAL_BEEF renamed "Grass-fed Beef & eggplant Mutabal" -> "Grass-Fed Beef Kebab"; customer_description + _ru + customer_ingredients rewritten to the real BOM (kebab x2 + hummus + tahini + tomato/cucumber + wrap, no mutabal, no fattoush); false "contains dairy" claim dropped to match allergens[]={gluten,sesame}; image_url + menu_photo_map repointed to Drive asset 1HCbAhN6mLt2... ("Beef Kebab Meal.png"). Closes the name/BOM drift logged in mig 437. Nutrition, price, portion and allergens untouched -- already correct. Loyverse push queued. MC 5936616d.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
