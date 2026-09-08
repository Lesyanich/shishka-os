-- 441_beef_kebab_declare_mustard.sql
-- Follow-up to 440. Adds the missing MUSTARD declaration to SALE-PROTEIN_MEAL_BEEF
-- ("Grass-Fed Beef Kebab", 8654ec3e-89f6-4bff-a9ad-18f568b64d31).
--
-- WHY THIS EXISTS. Migration 440 rewrote the customer description and ended it "Contains gluten
-- and sesame", matching allergens[]={gluten,sesame}. The Loyverse push from 440 then came back
-- with a description ending "(contains: gluten, mustard, sesame)". The till was declaring an
-- allergen the website was not.
--
-- The two are not reading the same source, which is the actual root cause:
--   * the WEBSITE reads nomenclature.allergens[]  -- a hand-maintained text array
--   * the TILL reads fn_dish_allergens(id)        -- recursive over bom_structures, via
--                                                    nomenclature_tags -> tags(tag_group='allergen')
-- The BOM-derived one is the one with evidence behind it, and it is the one that was right.
--
-- WHERE THE MUSTARD COMES FROM. Exactly one node, at depth 1: RAW-PICKLED_GHERKIN
-- ("Pickled Gherkins (drained)", a96acc84-...), 40 g on the plate, carrying the allergen-mustard
-- tag. The only other mustard-tagged row in the whole catalogue is RAW-MUSTARD-DIJON, which is
-- NOT in this BOM. Pickling brine routinely carries mustard seed, so the tag is credible on its
-- face; it was set deliberately (no migration in this repo added it -- it came in via the admin
-- panel), and nothing contradicts it. Note the gherkin's OWN allergens[] column is NULL, which is
-- precisely why the array-based path lost the mustard while the tag-based path kept it.
--
-- DIRECTION OF THE FIX. We add mustard rather than untag the gherkin. Over-declaring is the safe
-- error; under-declaring is the one that hurts somebody. If the chef later confirms this specific
-- gherkin brine is mustard-free, the tag comes off the RAW row and every dish downstream corrects
-- itself in one edit -- which is the right place to make that call, not here.
--
-- SCOPE. Two columns on ONE row. The Russian description is deliberately untouched: only 2 of 85
-- live dishes carry an allergen sentence in customer_description_ru, so RU does not use that
-- convention -- allergens[] is the structured surface both languages render from.
--
-- NOT FIXED HERE, LOGGED INSTEAD: 17 other live dishes under-declare against their own BOM, three
-- of them missing NUTS or GLUTEN with an empty allergens[] entirely. That is a bigger and more
-- dangerous problem than this one and it needs a per-dish chef review of whether each tag is
-- accurate, so it is going to Mission Control rather than being mass-applied from here.
--
-- CONTRACT-REVIEWED: values only, no shape change. Two text/array columns on ONE existing
--   nomenclature row. No column added, dropped or retyped; no row enters or leaves menu_public,
--   which must still read 86. price, calories, protein, portion_size, name, image_url all
--   untouched -- every numeric field the contract exposes is bit-identical. allergens[] gains one
--   element, which is the entire point of the migration.
--   contract-check.mjs green against the direct Supabase endpoint and https://shishka.health/sb.
BEGIN;

-- 1. Declare the allergen the BOM has been carrying all along -----------------------------
UPDATE public.nomenclature
SET allergens            = ARRAY['gluten','mustard','sesame'],
    customer_description = replace(
                             customer_description,
                             'Contains gluten and sesame.',
                             'Contains gluten, mustard and sesame.'),
    updated_at           = now()
WHERE id = '8654ec3e-89f6-4bff-a9ad-18f568b64d31';

-- 2. Assert we actually changed the sentence ----------------------------------------------
-- replace() is a silent no-op if the phrase drifted, which would leave allergens[] and the
-- printed sentence disagreeing again -- the exact bug this migration exists to close.
DO $$
DECLARE v_desc text; v_allergens text[];
BEGIN
  SELECT customer_description, allergens INTO v_desc, v_allergens
  FROM public.nomenclature WHERE id = '8654ec3e-89f6-4bff-a9ad-18f568b64d31';

  IF v_desc NOT LIKE '%Contains gluten, mustard and sesame.%' THEN
    RAISE EXCEPTION 'mig441: allergen sentence not rewritten; description tail is %',
      right(v_desc, 80);
  END IF;
  IF NOT ('mustard' = ANY(v_allergens)) THEN
    RAISE EXCEPTION 'mig441: allergens[] missing mustard: %', v_allergens;
  END IF;
END $$;

-- 3. Push the corrected description to the till -------------------------------------------
-- The till's auto-suffix already said mustard, but the body text it wraps has changed, so the
-- two halves of the POS description should be re-pushed together. Same guards as 440.
INSERT INTO public.loyverse_push_queue (action, target_id, status, requested_by)
SELECT 'dish', n.id, 'pending', 'migration-441'
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
  '441_beef_kebab_declare_mustard.sql',
  'Follow-up to 440. SALE-PROTEIN_MEAL_BEEF allergens[] {gluten,sesame} -> {gluten,mustard,sesame} and customer_description "Contains gluten and sesame." -> "Contains gluten, mustard and sesame.". Mustard enters via RAW-PICKLED_GHERKIN (40 g, depth 1, allergen-mustard tag, own allergens[] NULL); fn_dish_allergens saw it and the till declared it while the website did not. Root cause is two unreconciled allergen sources: nomenclature.allergens[] (web) vs nomenclature_tags/tags (till, BOM-recursive). 17 further live dishes under-declare the same way -- logged to MC, not fixed here. RU untouched (not the RU convention). MC 5936616d.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
