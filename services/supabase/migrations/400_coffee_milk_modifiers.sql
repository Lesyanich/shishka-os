-- 400_coffee_milk_modifiers.sql
-- MC d8d35bf6 — CEO: staff cannot choose alternative milk on the iced coffees at the till.
--
-- The "Milk" group (Loyverse list 8105066d: Cow ฿0 default, Almond/Coconut/Oat +฿25, max 1)
-- already exists and is attached to 11 drinks, but never reached 4 live milk-based coffees.
-- Attaching it to those 4, matching the *complete* pattern used by hot Cappuccino/Latte —
-- both the POS side and the lego side:
--   1. dish_modifier_groups        → what the Loyverse push sends to the till
--   2. nomenclature_modifier_options → cost/nutrition rollup + public menu on shishka.health
-- Migration 359 wrote only (1) for the Thai teas, which is why they sit in v_modifier_drift
-- as missing_in_db. Not repeating that here.
--
-- Deliberately NOT included: Americano, Iced Americano, Espresso, Espresso Tonic, Orange and
-- Passion Fruit coffees contain no milk; the draft Mochas/Bulletproof are not in the POS yet.

BEGIN;

-- 1. POS attachment: Milk group on the 4 coffees (pick at most one, none required)
INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT n.id, '8105066d-7e6d-403f-b737-efb3b3a17a1c', 0, 0, 1
FROM nomenclature n
WHERE n.product_code IN (
        'SALE-COFFEE_ICED_CAPPUCCINO','SALE-COFFEE_ICED_LATTE',
        'SALE-COFFEE_CARAMEL_LATTE','SALE-COFFEE_ICED_CARAMEL_LATTE')
  AND NOT EXISTS (
    SELECT 1 FROM dish_modifier_groups dmg
    WHERE dmg.dish_id = n.id
      AND dmg.loyverse_modifier_list_id = '8105066d-7e6d-403f-b737-efb3b3a17a1c'
  );

-- 2. Lego side: the 4 milk options per dish. Loyverse option ids are copied from the
--    live mirror so cost/nutrition and the drift view line up with what the till sends.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, price_delta, is_default, sort_order, quantity_per_unit,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT d.id, m.id, o.price_delta, o.is_default, o.sort_order, 1,
       o.loyverse_modifier_id, '8105066d-7e6d-403f-b737-efb3b3a17a1c', 'Milk'
FROM (VALUES
        ('SALE-COFFEE_ICED_CAPPUCCINO'),
        ('SALE-COFFEE_ICED_LATTE'),
        ('SALE-COFFEE_CARAMEL_LATTE'),
        ('SALE-COFFEE_ICED_CARAMEL_LATTE')
     ) AS dish(code)
CROSS JOIN (VALUES
        ('MOD-MILK_COW',     0::numeric, true,  1, '87d9651f-a31f-44a3-ad8b-502c7c3d1b8b'),
        ('MOD-MILK_ALMOND',  25,         false, 2, 'c2f7398d-aece-4ab5-bd81-f8b57d069e3b'),
        ('MOD-MILK_COCONUT', 25,         false, 3, '387c8027-f3ca-47d0-a96c-e3ab51e997af'),
        ('MOD-MILK_OAT',     25,         false, 4, 'b92e8065-d416-457e-b507-107420343f0e')
     ) AS o(code, price_delta, is_default, sort_order, loyverse_modifier_id)
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
  grp_count INT;
  opt_count INT;
BEGIN
  SELECT count(*) INTO grp_count
  FROM dish_modifier_groups dmg
  JOIN nomenclature n ON n.id = dmg.dish_id
  WHERE dmg.loyverse_modifier_list_id = '8105066d-7e6d-403f-b737-efb3b3a17a1c'
    AND n.product_code IN (
      'SALE-COFFEE_ICED_CAPPUCCINO','SALE-COFFEE_ICED_LATTE',
      'SALE-COFFEE_CARAMEL_LATTE','SALE-COFFEE_ICED_CARAMEL_LATTE');

  SELECT count(*) INTO opt_count
  FROM nomenclature_modifier_options o
  JOIN nomenclature n ON n.id = o.dish_id
  WHERE o.loyverse_modifier_list_id = '8105066d-7e6d-403f-b737-efb3b3a17a1c'
    AND n.product_code IN (
      'SALE-COFFEE_ICED_CAPPUCCINO','SALE-COFFEE_ICED_LATTE',
      'SALE-COFFEE_CARAMEL_LATTE','SALE-COFFEE_ICED_CARAMEL_LATTE');

  IF grp_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 Milk group attachments, got %', grp_count;
  END IF;
  IF opt_count <> 16 THEN
    RAISE EXCEPTION 'expected 16 Milk option rows (4 dishes x 4 milks), got %', opt_count;
  END IF;
END $$;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES ('400_coffee_milk_modifiers.sql', 'claude-code',
        'Milk modifier group on Iced Cappuccino, Iced Latte, Caramel Latte, Iced Caramel Latte: 4 dish_modifier_groups + 16 nomenclature_modifier_options; attachments_dirty set. MC d8d35bf6.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
