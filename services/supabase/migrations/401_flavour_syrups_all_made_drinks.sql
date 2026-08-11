-- 401_flavour_syrups_all_made_drinks.sql
-- MC d8d35bf6 — CEO: "add options to add flavours from what we have like caramel syrup",
-- scope answered as "all drinks".
--
-- The "Coffee Boosters" group (Loyverse list 6d699d24) already carries exactly the flavours
-- asked for — Caramel / Vanilla / Hazelnut / Green Mint / Maple ฿20 each — plus Extra Espresso
-- Shot ฿30 and MCT Oil / Creatine ฿40. It is already on 12 drinks. Attaching it to the 15 live
-- made-to-order drinks that were missed, both sides of the model (same as migration 400):
--   1. dish_modifier_groups          → what the Loyverse push sends to the till
--   2. nomenclature_modifier_options → cost/nutrition rollup + public menu on shishka.health
--
-- "All drinks" is read as every drink a barista can actually pour syrup into. Deliberately
-- NOT included, and why:
--   * 7 soft drinks (Coca-Cola, Sprite, Fanta, Coke Zero, Singha Soda, Tonic, mineral water)
--     — sealed cans and bottles, nothing is made to order.
--   * 3 wellness shots (Ginger, Turmeric, Beetroot) — 30-50 ml, syrup defeats the purpose.
--   * 9 smoothies + Matcha Green Smoothie — they already carry their own "Boosters" list
--     (Creatine ฿40, Whey ฿50). Attaching Coffee Boosters too would show Creatine twice at
--     the till, which invites double-charging. Needs the two lists reconciled first.
--   * Espresso — same collision: it carries the standalone "Add MCT Oil" list (d7e65efa),
--     and MCT Oil ฿40 also sits inside Coffee Boosters. Attaching both would offer it twice.
--     Fixing that means detaching a group from a live POS item, so it waits for a CEO call.

BEGIN;

-- 1. POS attachment. sort_order 10 keeps Boosters below the Milk group (sort_order 0),
--    min 0 / max NULL = optional, several allowed — the shape every other drink uses.
INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT n.id, '6d699d24-6a83-4357-ba50-270faeea13bd', 10, 0, NULL
FROM nomenclature n
WHERE n.product_code IN (
        'SALE-COFFEE_CARAMEL_LATTE','SALE-COFFEE_ICED_AMERICANO',
        'SALE-COFFEE_ICED_CARAMEL_LATTE','SALE-COFFEE_PASSION_FRUIT',
        'SALE-MATCHA_ORANGE','SALE-MATCHA_PASSION_FRUIT',
        'SALE-LEMONADE_CLASSIC','SALE-LEMONADE_GINGER','SALE-LEMONADE_MINT',
        'SALE-LEMONADE_PASSIONFRUIT',
        'SALE-TEA_THAI_CARAMEL','SALE-TEA_THAI_HAZELNUT','SALE-TEA_THAI_HONEY',
        'SALE-TEA_THAI_MINT','SALE-TEA_THAI_VANILLA')
  AND NOT EXISTS (
    SELECT 1 FROM dish_modifier_groups dmg
    WHERE dmg.dish_id = n.id
      AND dmg.loyverse_modifier_list_id = '6d699d24-6a83-4357-ba50-270faeea13bd'
  );

-- 2. Lego side: the 8 options per dish. Loyverse option ids copied from the live mirror so
--    cost/nutrition and v_modifier_drift line up with what the till sends. Iced Americano,
--    Iced Caramel Latte and Passion Fruit Coffee already hold these 8 rows — the NOT EXISTS
--    guard leaves them alone, they only needed the attachment above.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, price_delta, is_default, sort_order, quantity_per_unit,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT d.id, m.id, o.price_delta, false, o.sort_order, 1,
       o.loyverse_modifier_id, '6d699d24-6a83-4357-ba50-270faeea13bd', 'Coffee Boosters'
FROM (VALUES
        ('SALE-COFFEE_CARAMEL_LATTE'),('SALE-COFFEE_ICED_AMERICANO'),
        ('SALE-COFFEE_ICED_CARAMEL_LATTE'),('SALE-COFFEE_PASSION_FRUIT'),
        ('SALE-MATCHA_ORANGE'),('SALE-MATCHA_PASSION_FRUIT'),
        ('SALE-LEMONADE_CLASSIC'),('SALE-LEMONADE_GINGER'),('SALE-LEMONADE_MINT'),
        ('SALE-LEMONADE_PASSIONFRUIT'),
        ('SALE-TEA_THAI_CARAMEL'),('SALE-TEA_THAI_HAZELNUT'),('SALE-TEA_THAI_HONEY'),
        ('SALE-TEA_THAI_MINT'),('SALE-TEA_THAI_VANILLA')
     ) AS dish(code)
CROSS JOIN (VALUES
        ('MOD-SYRUP_CARAMEL',    20::numeric, 1, '270c5975-06cf-4ced-924c-e53509342b5a'),
        ('MOD-SYRUP_GREEN_MINT', 20,          2, '5c85a709-5457-4f40-8460-7a28e861cbab'),
        ('MOD-SYRUP_MAPLE',      20,          3, '5ab07c7b-6e44-4ad6-8da2-d816081da8f0'),
        ('MOD-SYRUP_HAZELNUT',   20,          4, '70b6b1d9-52eb-4161-acb9-2c2d928dc8a0'),
        ('MOD-SYRUP_VANILLA',    20,          5, '4ab1e1f7-a229-44eb-8595-d085cacf3ca3'),
        ('MOD-ESPRESSO_EXTRA',   30,          6, 'd5c1acea-2e30-4dde-9df1-ff649540824b'),
        ('MOD-COFFEE_MCT',       40,          7, '6cf30359-4283-4297-bc31-be40b6127a5b'),
        ('MOD-CREATINE',         40,          8, 'f1cebec2-949d-4a5f-99e4-717203eb861f')
     ) AS o(code, price_delta, sort_order, loyverse_modifier_id)
JOIN nomenclature d ON d.product_code = dish.code
JOIN nomenclature m ON m.product_code = o.code
WHERE NOT EXISTS (
  SELECT 1 FROM nomenclature_modifier_options x
  WHERE x.dish_id = d.id AND x.modifier_id = m.id
);

-- 3. Light up the admin "Push to Loyverse" button — attachments now differ from the till.
UPDATE modifier_sync_state SET attachments_dirty = true WHERE id = 1;

-- 4. Assert the intended shape before committing.
DO $$
DECLARE
  codes TEXT[] := ARRAY[
    'SALE-COFFEE_CARAMEL_LATTE','SALE-COFFEE_ICED_AMERICANO',
    'SALE-COFFEE_ICED_CARAMEL_LATTE','SALE-COFFEE_PASSION_FRUIT',
    'SALE-MATCHA_ORANGE','SALE-MATCHA_PASSION_FRUIT',
    'SALE-LEMONADE_CLASSIC','SALE-LEMONADE_GINGER','SALE-LEMONADE_MINT',
    'SALE-LEMONADE_PASSIONFRUIT',
    'SALE-TEA_THAI_CARAMEL','SALE-TEA_THAI_HAZELNUT','SALE-TEA_THAI_HONEY',
    'SALE-TEA_THAI_MINT','SALE-TEA_THAI_VANILLA'];
  grp_count INT;
  opt_count INT;
BEGIN
  SELECT count(*) INTO grp_count
  FROM dish_modifier_groups dmg
  JOIN nomenclature n ON n.id = dmg.dish_id
  WHERE dmg.loyverse_modifier_list_id = '6d699d24-6a83-4357-ba50-270faeea13bd'
    AND n.product_code = ANY(codes);

  SELECT count(*) INTO opt_count
  FROM nomenclature_modifier_options o
  JOIN nomenclature n ON n.id = o.dish_id
  WHERE o.loyverse_modifier_list_id = '6d699d24-6a83-4357-ba50-270faeea13bd'
    AND n.product_code = ANY(codes);

  IF grp_count <> 15 THEN
    RAISE EXCEPTION 'expected 15 Coffee Boosters attachments, got %', grp_count;
  END IF;
  IF opt_count <> 120 THEN
    RAISE EXCEPTION 'expected 120 Coffee Boosters option rows (15 drinks x 8), got %', opt_count;
  END IF;
END $$;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES ('401_flavour_syrups_all_made_drinks.sql', 'claude-code',
        'Coffee Boosters (5 syrups THB 20, espresso shot THB 30, MCT/creatine THB 40) on 15 live made-to-order drinks: 4 coffees, 2 matcha, 4 lemonades, 5 Thai teas. 15 dish_modifier_groups + 96 new nomenclature_modifier_options; attachments_dirty set. Soft drinks, wellness shots, smoothies and Espresso excluded. MC d8d35bf6.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
