-- 407_espresso_double_shot.sql
-- MC 83bafe47 — CEO 2026-08-24: "add double shot espressos 30 baht extra on POS".
--
-- The +THB 30 upsell already exists: MOD-ESPRESSO_EXTRA sits inside the "Coffee Boosters"
-- list (Loyverse 6d699d24) and is attached to 27 items, i.e. every live coffee except one —
-- Espresso itself. Migration 401 had to skip it: Espresso carries the standalone "Add MCT Oil"
-- list (d7e65efa) and MCT Oil THB 40 also sits inside Coffee Boosters, so attaching both would
-- offer it twice and a cashier could charge THB 80. CEO has now made the call.
--
-- Two facts found while checking, both decided by CEO on 2026-08-24:
--   1. SALE-COFFEE_ESPRESSO was built on 24 g of beans while every other coffee uses 12 g —
--      the THB 60 "Espresso" was already a double. Selling a "+30 double shot" on top of that
--      would have poured a triple. CEO: drop the base to a 12 g single; +30 makes it a double.
--   2. MOD-ESPRESSO_EXTRA had NO BOM and cost_per_unit = 0, so all 27 items billed THB 30 for
--      an extra shot that consumed no beans in the system. Bean stock drifted on every sale
--      and the modifier looked infinitely profitable. It gets the 12 g it actually pours.
--
-- Deliberately NOT touched here (logged separately, see MC notes):
--   * Iced Cappuccino / Orange Coffee / Passion Fruit Coffee also carry 24 g vs 12 g on their
--     siblings. Same smell, but each needs its own CEO call — not silently normalised.
--   * The 9 smoothies + Matcha Green Smoothie half of task 83bafe47 (Creatine duplicated
--     between "Boosters" and "Coffee Boosters"). Untouched, still awaiting a decision.

BEGIN;

-- 1. Detach the standalone "Add MCT Oil" group from Espresso — both sides.
--    Nothing is lost: MCT Oil stays sellable at THB 40 inside Coffee Boosters (step 2).
DELETE FROM nomenclature_modifier_options o
USING nomenclature n
WHERE o.dish_id = n.id
  AND n.product_code = 'SALE-COFFEE_ESPRESSO'
  AND o.loyverse_modifier_list_id = 'd7e65efa-2b28-4ce7-9554-317986345907';

DELETE FROM dish_modifier_groups g
USING nomenclature n
WHERE g.dish_id = n.id
  AND n.product_code = 'SALE-COFFEE_ESPRESSO'
  AND g.loyverse_modifier_list_id = 'd7e65efa-2b28-4ce7-9554-317986345907';

-- 2. Attach Coffee Boosters instead. Same shape as migration 401: sort_order 10,
--    min 0 / max NULL = optional, several allowed.
INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT n.id, '6d699d24-6a83-4357-ba50-270faeea13bd', 10, 0, NULL
FROM nomenclature n
WHERE n.product_code = 'SALE-COFFEE_ESPRESSO'
  AND NOT EXISTS (
    SELECT 1 FROM dish_modifier_groups dmg
    WHERE dmg.dish_id = n.id
      AND dmg.loyverse_modifier_list_id = '6d699d24-6a83-4357-ba50-270faeea13bd'
  );

-- Lego side: the same 8 options every other Coffee Boosters drink carries. Loyverse option ids
-- copied from the live mirror so the till, the cost rollup and v_modifier_drift agree.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, price_delta, is_default, sort_order, quantity_per_unit,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT d.id, m.id, o.price_delta, false, o.sort_order, 1,
       o.loyverse_modifier_id, '6d699d24-6a83-4357-ba50-270faeea13bd', 'Coffee Boosters'
FROM (VALUES
        ('MOD-SYRUP_CARAMEL',    20::numeric, 1, '270c5975-06cf-4ced-924c-e53509342b5a'),
        ('MOD-SYRUP_GREEN_MINT', 20,          2, '5c85a709-5457-4f40-8460-7a28e861cbab'),
        ('MOD-SYRUP_MAPLE',      20,          3, '5ab07c7b-6e44-4ad6-8da2-d816081da8f0'),
        ('MOD-SYRUP_HAZELNUT',   20,          4, '70b6b1d9-52eb-4161-acb9-2c2d928dc8a0'),
        ('MOD-SYRUP_VANILLA',    20,          5, '4ab1e1f7-a229-44eb-8595-d085cacf3ca3'),
        ('MOD-ESPRESSO_EXTRA',   30,          6, 'd5c1acea-2e30-4dde-9df1-ff649540824b'),
        ('MOD-COFFEE_MCT',       40,          7, '6cf30359-4283-4297-bc31-be40b6127a5b'),
        ('MOD-CREATINE',         40,          8, 'f1cebec2-949d-4a5f-99e4-717203eb861f')
     ) AS o(code, price_delta, sort_order, loyverse_modifier_id)
JOIN nomenclature m ON m.product_code = o.code
CROSS JOIN (
  SELECT id FROM nomenclature WHERE product_code = 'SALE-COFFEE_ESPRESSO'
) AS d
WHERE NOT EXISTS (
    SELECT 1 FROM nomenclature_modifier_options x
    WHERE x.dish_id = d.id AND x.modifier_id = m.id
  );

-- 3. Base Espresso becomes a single shot: 24 g → 12 g, matching every other coffee.
--    Price stays THB 60 (CEO decision). trg_bom_structure_cost_cascade recomputes the cost.
UPDATE bom_structures b
SET quantity_per_unit = 12
FROM nomenclature d, nomenclature ing
WHERE b.parent_id = d.id
  AND b.ingredient_id = ing.id
  AND d.product_code = 'SALE-COFFEE_ESPRESSO'
  AND ing.product_code = 'RAW-COFFEE-ESPRESSO';

-- 4. The +THB 30 shot finally pours real beans: 12 g, same as one shot in any coffee.
--    Fires the cost cascade → cost_per_unit ≈ 12 × 0.4833 = THB 5.80 instead of 0.
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, notes)
SELECT m.id, ing.id, 12, 'One espresso shot — 12 g, same as the shot inside every coffee (MC 83bafe47)'
FROM nomenclature m, nomenclature ing
WHERE m.product_code = 'MOD-ESPRESSO_EXTRA'
  AND ing.product_code = 'RAW-COFFEE-ESPRESSO'
  AND NOT EXISTS (
    SELECT 1 FROM bom_structures b
    WHERE b.parent_id = m.id AND b.ingredient_id = ing.id
  );

-- 5. Light up the admin "Push to Loyverse" button — attachments now differ from the till.
UPDATE modifier_sync_state SET attachments_dirty = true WHERE id = 1;

-- 6. Assert the intended shape before committing.
DO $$
DECLARE
  v_espresso UUID;
  v_mct_rows INT;
  v_boost_grp INT;
  v_boost_opt INT;
  v_base_g NUMERIC;
  v_shot_g NUMERIC;
BEGIN
  SELECT id INTO v_espresso FROM nomenclature WHERE product_code = 'SALE-COFFEE_ESPRESSO';

  SELECT count(*) INTO v_mct_rows
  FROM dish_modifier_groups
  WHERE dish_id = v_espresso
    AND loyverse_modifier_list_id = 'd7e65efa-2b28-4ce7-9554-317986345907';

  SELECT count(*) INTO v_boost_grp
  FROM dish_modifier_groups
  WHERE dish_id = v_espresso
    AND loyverse_modifier_list_id = '6d699d24-6a83-4357-ba50-270faeea13bd';

  SELECT count(*) INTO v_boost_opt
  FROM nomenclature_modifier_options
  WHERE dish_id = v_espresso
    AND loyverse_modifier_list_id = '6d699d24-6a83-4357-ba50-270faeea13bd';

  SELECT b.quantity_per_unit INTO v_base_g
  FROM bom_structures b JOIN nomenclature ing ON ing.id = b.ingredient_id
  WHERE b.parent_id = v_espresso AND ing.product_code = 'RAW-COFFEE-ESPRESSO';

  SELECT b.quantity_per_unit INTO v_shot_g
  FROM bom_structures b
  JOIN nomenclature m ON m.id = b.parent_id
  JOIN nomenclature ing ON ing.id = b.ingredient_id
  WHERE m.product_code = 'MOD-ESPRESSO_EXTRA' AND ing.product_code = 'RAW-COFFEE-ESPRESSO';

  IF v_mct_rows <> 0 THEN
    RAISE EXCEPTION 'Add MCT Oil still attached to Espresso (% rows) — duplicate MCT risk', v_mct_rows;
  END IF;
  IF v_boost_grp <> 1 THEN
    RAISE EXCEPTION 'expected 1 Coffee Boosters attachment on Espresso, got %', v_boost_grp;
  END IF;
  IF v_boost_opt <> 8 THEN
    RAISE EXCEPTION 'expected 8 Coffee Boosters option rows on Espresso, got %', v_boost_opt;
  END IF;
  IF v_base_g <> 12 THEN
    RAISE EXCEPTION 'expected Espresso base 12 g, got %', v_base_g;
  END IF;
  IF v_shot_g <> 12 THEN
    RAISE EXCEPTION 'expected MOD-ESPRESSO_EXTRA to pour 12 g, got %', v_shot_g;
  END IF;
END $$;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES ('407_espresso_double_shot.sql', 'claude-code',
        'Espresso joins Coffee Boosters: detached standalone "Add MCT Oil" list, attached Coffee Boosters (1 group + 8 options) so the THB 30 Extra Espresso Shot is finally sellable on Espresso. Base Espresso 24 g -> 12 g (was already a double at THB 60; CEO call, price unchanged). MOD-ESPRESSO_EXTRA given its missing 12 g BOM line so extra shots deduct beans and cost ~THB 5.80 instead of 0 across all 27 attached items. attachments_dirty set. MC 83bafe47.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
