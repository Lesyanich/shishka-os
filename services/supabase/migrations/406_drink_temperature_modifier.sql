-- 406_drink_temperature_modifier.sql
-- Spec: docs/plans/spec-drink-temperature-modifier.md  |  MC task 93da602a
--
-- Replaces the twin hot/iced items with ONE item per drink plus a required
-- Temperature choice. Loyverse prices a modifier option once, globally, so two
-- lists are needed: "Temperature +10" for the milk drinks and the existing free
-- "Temperature" list for Americano (iced Americano costs the same as hot).
--
-- Packaging moves OUT of the dish BOM and INTO the two temperature MODs. A MOD
-- cannot subtract a component, so the hot cup could not stay in a shared base
-- recipe. Because the group is required (min_select = 1) exactly one option
-- fires per order and packaging is deducted exactly once — fn_deduct_order_bom
-- already explodes the BOM of any bound order_item_modifiers row (mig 200).
--
-- PRECONDITION: "Temperature +10" (Hot ฿0 / Iced ฿10, min_select 1, max_select 1)
-- must exist in Loyverse AND the existing free "Temperature" list must be updated to
-- min_select 1 / max_select 1, then loyverse-sync?action=pull_modifiers.
-- Both lists are resolved BY NAME below and the guard raises if either is missing.
--
-- "Required" is a property of the LIST in Loyverse. dish_modifier_groups.min_select
-- below is our-side metadata that the push path never sends — it pushes a flat
-- modifier_ids array (reattachAllDishes, loyverse-sync/index.ts:704-719). If a list
-- is skippable at the till the drink rings with NO packaging deducted at all, so both
-- lists must carry min_select = 1. The guard deliberately does not assert it: Loyverse
-- omits the field from some list responses and a false positive would block a correct
-- apply. Verify at the till instead. See spec §4.4.
--
-- NOT in this migration: retiring the 5 iced items. They stay live until the CEO
-- has verified the toggle at the till, so there is a rollback path.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Guards — fail loudly rather than half-applying.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_free TEXT;
  v_paid TEXT;
  v_iced_price NUMERIC;
BEGIN
  SELECT id INTO v_free FROM pos_loyverse_modifier_lists WHERE name = 'Temperature';
  SELECT id INTO v_paid FROM pos_loyverse_modifier_lists WHERE name = 'Temperature +10';

  IF v_free IS NULL THEN
    RAISE EXCEPTION 'Loyverse list "Temperature" missing from mirror — run pull_modifiers';
  END IF;
  IF v_paid IS NULL THEN
    RAISE EXCEPTION 'Loyverse list "Temperature +10" missing from mirror — create it in Loyverse (Hot 0 / Iced 10, required, max 1), then run pull_modifiers';
  END IF;

  -- Every list must carry exactly the two options this migration wires.
  IF (SELECT count(*) FROM pos_loyverse_modifier_options
      WHERE list_id IN (v_free, v_paid) AND name IN ('Hot','Iced')) <> 4 THEN
    RAISE EXCEPTION 'Expected Hot + Iced options on both Temperature lists, found %',
      (SELECT count(*) FROM pos_loyverse_modifier_options
       WHERE list_id IN (v_free, v_paid) AND name IN ('Hot','Iced'));
  END IF;

  -- The premium is the whole point of the second list.
  SELECT price INTO v_iced_price FROM pos_loyverse_modifier_options
   WHERE list_id = v_paid AND name = 'Iced';
  IF v_iced_price IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'Iced option on "Temperature +10" is priced % — expected 10', v_iced_price;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Packaging recipes for the two temperature MODs.
--    MOD-TEMP_HOT / MOD-TEMP_ICED already exist as nomenclature rows (type
--    'modifier') but carried no BOM.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit)
SELECT p.id, c.id, v.qty::numeric
FROM (VALUES
  ('MOD-TEMP_HOT',  'RAW-CUP_PAPER_8OZ',   1),
  ('MOD-TEMP_HOT',  'RAW-LID_PAPER_8OZ',   1),
  ('MOD-TEMP_ICED', 'RAW-CUP_PP_18OZ',     1),
  ('MOD-TEMP_ICED', 'RAW-LID_DOME_95MM',   1),
  ('MOD-TEMP_ICED', 'RAW-STRAW_ECO_21CM',  1),
  ('MOD-TEMP_ICED', 'RAW-ICE_CUBES',    0.25)
) AS v(mod_code, raw_code, qty)
JOIN nomenclature p ON p.product_code = v.mod_code
JOIN nomenclature c ON c.product_code = v.raw_code
WHERE NOT EXISTS (
  SELECT 1 FROM bom_structures b
  WHERE b.parent_id = p.id AND b.ingredient_id = c.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Food-cost link: Loyverse option -> MOD nomenclature. Without this the
--    deduction walker skips the option and no packaging is consumed.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO modifier_option_cost (loyverse_modifier_option_id, modifier_id, quantity_per_unit)
SELECT o.id, m.id, 1
FROM pos_loyverse_modifier_options o
JOIN pos_loyverse_modifier_lists l ON l.id = o.list_id
JOIN nomenclature m
  ON m.product_code = CASE WHEN o.name = 'Hot' THEN 'MOD-TEMP_HOT' ELSE 'MOD-TEMP_ICED' END
WHERE l.name IN ('Temperature', 'Temperature +10')
  AND o.name IN ('Hot', 'Iced')
ON CONFLICT (loyverse_modifier_option_id) DO UPDATE
  SET modifier_id       = EXCLUDED.modifier_id,
      quantity_per_unit = EXCLUDED.quantity_per_unit,
      updated_at        = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Attach the right list to each drink. Americano goes on the free list
--    because hot and iced Americano are both 65.
-- ─────────────────────────────────────────────────────────────────────────────

-- Temperature is the first decision the cashier makes; push existing groups down.
UPDATE dish_modifier_groups dmg
   SET sort_order = dmg.sort_order + 1
  FROM nomenclature n
 WHERE dmg.dish_id = n.id
   AND n.product_code IN (
     'SALE-COFFEE_AMERICANO','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_LATTE',
     'SALE-COFFEE_CARAMEL_LATTE','SALE-MATCHA_LATTE')
   AND dmg.loyverse_modifier_list_id NOT IN (
     SELECT id FROM pos_loyverse_modifier_lists
      WHERE name IN ('Temperature','Temperature +10'));

INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT n.id, l.id, 0, 1, 1
FROM (VALUES
  ('SALE-COFFEE_AMERICANO',     'Temperature'),
  ('SALE-COFFEE_CAPPUCCINO',    'Temperature +10'),
  ('SALE-COFFEE_LATTE',         'Temperature +10'),
  ('SALE-COFFEE_CARAMEL_LATTE', 'Temperature +10'),
  ('SALE-MATCHA_LATTE',         'Temperature +10')
) AS s(dish_code, list_name)
JOIN nomenclature n ON n.product_code = s.dish_code
JOIN pos_loyverse_modifier_lists l ON l.name = s.list_name
WHERE NOT EXISTS (
  SELECT 1 FROM dish_modifier_groups dmg
  WHERE dmg.dish_id = n.id AND dmg.loyverse_modifier_list_id = l.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Option-level rows (our side of the mirror: price, default, cost link).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, price_delta, is_default, sort_order, quantity_per_unit,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT n.id,
       m.id,
       o.price,
       (o.name = 'Hot'),
       CASE WHEN o.name = 'Hot' THEN 0 ELSE 1 END,
       1,
       o.id,
       l.id,
       l.name
FROM (VALUES
  ('SALE-COFFEE_AMERICANO',     'Temperature'),
  ('SALE-COFFEE_CAPPUCCINO',    'Temperature +10'),
  ('SALE-COFFEE_LATTE',         'Temperature +10'),
  ('SALE-COFFEE_CARAMEL_LATTE', 'Temperature +10'),
  ('SALE-MATCHA_LATTE',         'Temperature +10')
) AS s(dish_code, list_name)
JOIN nomenclature n ON n.product_code = s.dish_code
JOIN pos_loyverse_modifier_lists l ON l.name = s.list_name
JOIN pos_loyverse_modifier_options o ON o.list_id = l.id AND o.name IN ('Hot','Iced')
JOIN nomenclature m
  ON m.product_code = CASE WHEN o.name = 'Hot' THEN 'MOD-TEMP_HOT' ELSE 'MOD-TEMP_ICED' END
WHERE NOT EXISTS (
  SELECT 1 FROM nomenclature_modifier_options nmo
  WHERE nmo.dish_id = n.id AND nmo.loyverse_modifier_id = o.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Packaging leaves the dish recipes — it now lives on the temperature option.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM bom_structures b
USING nomenclature p, nomenclature c
WHERE b.parent_id = p.id
  AND b.ingredient_id = c.id
  AND p.product_code IN (
    'SALE-COFFEE_AMERICANO','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_LATTE',
    'SALE-COFFEE_CARAMEL_LATTE','SALE-MATCHA_LATTE')
  AND c.product_code IN ('RAW-CUP_PAPER_8OZ','RAW-LID_PAPER_8OZ');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Post-conditions.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_groups INT; v_options INT; v_leftover INT;
BEGIN
  SELECT count(*) INTO v_groups
  FROM dish_modifier_groups dmg
  JOIN nomenclature n ON n.id = dmg.dish_id
  JOIN pos_loyverse_modifier_lists l ON l.id = dmg.loyverse_modifier_list_id
  WHERE l.name IN ('Temperature','Temperature +10')
    AND n.product_code IN (
      'SALE-COFFEE_AMERICANO','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_LATTE',
      'SALE-COFFEE_CARAMEL_LATTE','SALE-MATCHA_LATTE');
  IF v_groups <> 5 THEN
    RAISE EXCEPTION 'Expected 5 temperature groups, got %', v_groups;
  END IF;

  SELECT count(*) INTO v_options
  FROM nomenclature_modifier_options nmo
  JOIN nomenclature n ON n.id = nmo.dish_id
  WHERE nmo.loyverse_modifier_list_name IN ('Temperature','Temperature +10')
    AND n.product_code IN (
      'SALE-COFFEE_AMERICANO','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_LATTE',
      'SALE-COFFEE_CARAMEL_LATTE','SALE-MATCHA_LATTE');
  IF v_options <> 10 THEN
    RAISE EXCEPTION 'Expected 10 temperature options (5 dishes x Hot/Iced), got %', v_options;
  END IF;

  -- No surviving dish may still carry its own cup: that would double-charge stock.
  SELECT count(*) INTO v_leftover
  FROM bom_structures b
  JOIN nomenclature p ON p.id = b.parent_id
  JOIN nomenclature c ON c.id = b.ingredient_id
  WHERE p.product_code IN (
    'SALE-COFFEE_AMERICANO','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_LATTE',
    'SALE-COFFEE_CARAMEL_LATTE','SALE-MATCHA_LATTE')
    AND c.product_code IN ('RAW-CUP_PAPER_8OZ','RAW-LID_PAPER_8OZ',
                           'RAW-CUP_PP_18OZ','RAW-LID_DOME_95MM');
  IF v_leftover <> 0 THEN
    RAISE EXCEPTION 'Packaging still on % dish BOM rows', v_leftover;
  END IF;
END $$;

-- Attachments changed → admin panel lights up "Push to Loyverse".
UPDATE modifier_sync_state SET attachments_dirty = true, updated_at = now() WHERE id = 1;

INSERT INTO migration_log (filename, notes)
VALUES ('406_drink_temperature_modifier.sql',
        'Temperature (Hot/Iced) modifier on 5 drinks: Americano on the free list, 4 milk drinks on Temperature +10. Packaging moved from dish BOMs into MOD-TEMP_HOT/MOD-TEMP_ICED. Iced twin items not yet retired.');

COMMIT;
