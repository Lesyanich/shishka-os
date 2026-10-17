-- 515_house_mayo_pf_approx_recipe.sql
--
-- A real mayonnaise in the BOM, with an APPROXIMATE recipe, so the retired one can finally go.
-- CEO 2026-10-17: "the chef makes the mayonnaise from olive oil — write an approximate recipe to
-- unblock, we will refine it with him later."
--
-- THE PROBLEM THIS CLOSES
-- RAW-MAYONNAISE-HEALTHY ("Mayonnaise (Avocado/Olive Oil)") is soft-deleted, has NO cost, and is
-- still an ingredient of 5 active recipes: PF-DYNAMITE_SAUCE (0.85 kg), PF-GARLIC_CREAM (0.15),
-- PF-HONEY_MUSTARD (0.60), PF-TRUFFLE_MAYO (0.92) and SALE-WRAP_FOLD_EGGS_FAJITA (0.05).
-- Consequences found while building the diet tags: (1) those dishes carry a retired ingredient, which
-- blocks every confidence check (fn_dish_diet_status refuses a dish with a soft-deleted leaf);
-- (2) the sauces are costed WITHOUT their main ingredient (Dynamite Sauce reads cost 0.00).
--
-- WHAT THIS DOES
--   1. Creates PF-MAYONNAISE_OLIVE, house-made, kg, chilled.
--   2. Gives it an approximate classic emulsion, per 1 kg of output:
--        olive oil 0.80 L · whole egg 3.5 pcs · lemon juice 0.045 L · Dijon mustard 0.015 kg · salt 0.008 kg
--      (about 0.99 kg of ingredients; an emulsion loses nothing).
--   3. Re-points the 5 BOM lines from the retired RAW to the new PF. Both are kg, so each line's
--      quantity keeps its meaning. (The mig 302/304 lesson: never re-point across different base
--      units; this asserts the base units match.)
--   4. Leaves the retired RAW row exactly as it is.
--
-- EVERY NUMBER IS A PLACEHOLDER UNTIL THE CHEF CONFIRMS IT. The quantities are a textbook
-- mayonnaise (about 3.5 eggs, 0.8 L of oil, an acid, mustard and salt per kilo), not his recipe.
-- The notes column says so, so the row cannot be mistaken for a measured one.
--
-- QUIRK TO KNOW, NOT FIXED HERE: RAW-EGG has base_unit 'pcs' but is COSTED PER 30-EGG TRAY
-- (cost_per_unit 96.5, purchases of 1-2 trays at 71-105 THB; existing BOMs use 0.1 for ~3 eggs).
-- To be consistent with every other recipe, the egg line is 3.5 / 30 = 0.1167 tray.
--
-- SIDE EFFECTS, ALL INTENDED
--   * The 4 sauces and the wrap gain a real cost for the mayonnaise they contain (it was NULL = free).
--   * Their allergen walk now reaches egg AND mustard through the new PF's real ingredients.
--   * The nutrition cascade recomputes the PF and everything above it.
--
-- WHAT STILL BLOCKS "CONFIDENT": RAW-EGG is allergen-unreviewed (MC 572c53b1 owns that ledger),
-- so allergen confidence for these dishes is unchanged by this migration. The diet side loses its
-- soft-deleted blocker; egg still needs its origin confirmed.
--
-- NOT APPLIED. Applying is a one-way recipe decision for the chef to bless first.

BEGIN;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['RAW-MAYONNAISE-HEALTHY','RAW-OLIVE-OIL','RAW-EGG','RAW-LEMON-JUICE','RAW-MUSTARD-DIJON','RAW-SALT-PLAIN']) AS c
  WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '515 abort: missing nomenclature rows: %', v_missing;
  END IF;
END $$;

-- 1. The PF. type/base_unit/storage follow the other sauces (PF-DYNAMITE_SAUCE et al).
INSERT INTO public.nomenclature
    (product_code, name, type, base_unit, storage_type, is_available, notes)
SELECT 'PF-MAYONNAISE_OLIVE', 'Mayonnaise (house-made, olive oil)', 'semi_finished', 'kg', 'chilled', true,
       'APPROXIMATE RECIPE (CEO 2026-10-17): textbook mayonnaise quantities, NOT the chef''s measured recipe. '
       || 'Chef makes it from olive oil; confirm oil, egg, acid, mustard and salt per kg, then remove this note. '
       || 'RAW-EGG is costed per 30-egg tray, so the egg line is eggs/30.'
WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = 'PF-MAYONNAISE_OLIVE');

-- 2. The approximate recipe, per 1 kg.
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit)
SELECT p.id, i.id, v.qty
FROM (VALUES
  ('RAW-OLIVE-OIL',      0.8000),   -- L
  ('RAW-EGG',            0.1167),   -- trays of 30: 3.5 eggs
  ('RAW-LEMON-JUICE',    0.0450),   -- L
  ('RAW-MUSTARD-DIJON',  0.0150),   -- kg
  ('RAW-SALT-PLAIN',     0.0080)    -- kg
) AS v(code, qty)
JOIN public.nomenclature i ON i.product_code = v.code
CROSS JOIN (SELECT id FROM public.nomenclature WHERE product_code = 'PF-MAYONNAISE_OLIVE') p
WHERE NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = p.id AND b.ingredient_id = i.id);

-- 3. Re-point the 5 lines. Same base unit or abort.
DO $$
DECLARE
  v_old uuid; v_new uuid; v_n int;
BEGIN
  SELECT id INTO v_old FROM public.nomenclature WHERE product_code = 'RAW-MAYONNAISE-HEALTHY';
  SELECT id INTO v_new FROM public.nomenclature WHERE product_code = 'PF-MAYONNAISE_OLIVE';

  IF (SELECT base_unit FROM public.nomenclature WHERE id = v_old)
     IS DISTINCT FROM (SELECT base_unit FROM public.nomenclature WHERE id = v_new) THEN
    RAISE EXCEPTION '515 abort: base units differ, refusing to re-point quantities across units';
  END IF;

  UPDATE public.bom_structures b
     SET ingredient_id = v_new
    FROM public.nomenclature p
   WHERE b.ingredient_id = v_old
     AND p.id = b.parent_id
     AND p.product_code IN ('PF-DYNAMITE_SAUCE','PF-GARLIC_CREAM','PF-HONEY_MUSTARD','PF-TRUFFLE_MAYO','SALE-WRAP_FOLD_EGGS_FAJITA');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '515 abort: expected to re-point 5 BOM lines, moved %', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.bom_structures WHERE ingredient_id = v_old) THEN
    RAISE EXCEPTION '515 abort: the retired mayonnaise is still referenced by another recipe';
  END IF;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('515_house_mayo_pf_approx_recipe.sql', 'claude-opus-session-df80a758', NULL,
        'Created PF-MAYONNAISE_OLIVE with an APPROXIMATE recipe (olive oil 0.80 L, egg 3.5 pcs = 0.1167 tray, lemon juice 0.045 L, dijon 0.015 kg, salt 0.008 kg per kg; chef to confirm) and re-pointed the 5 BOM lines that used the retired, uncosted RAW-MAYONNAISE-HEALTHY (PF-DYNAMITE_SAUCE, PF-GARLIC_CREAM, PF-HONEY_MUSTARD, PF-TRUFFLE_MAYO, SALE-WRAP_FOLD_EGGS_FAJITA). Same base unit kg, asserted. Removes the soft-deleted leaf that blocked those dishes and gives the sauces a real mayonnaise cost.');

COMMIT;
