-- 289_smoothie_modifier_reconcile.sql
-- Reconcile smoothie (KP-DRK-SMT) web modifier config with Loyverse (the 36
-- rows v_modifier_drift flagged). Smoothies already have a web build-your-own
-- config; this fixes three specific divergences (no full rebuild — their
-- required "Pick Fruits >=2" structure is web-intentional).
--
-- 1) Lions Mane removed from POS Boosters during the Lion's Mane pull, but the
--    web config still offered it on 9 smoothies -> drop the stale option.
-- 2) Blueberry priced ฿25 in DB vs ฿20 on POS -> align to POS.
-- 3) "Base Upgrade (from Milk/Water/Yogurt)" groups offer Almond/Oat Milk on POS
--    but not on the web -> add them, mirroring POS deltas.

BEGIN;

-- 1) Drop the fully-retired Lion's Mane from every web modifier option.
DELETE FROM nomenclature_modifier_options
WHERE modifier_id = (SELECT id FROM nomenclature WHERE product_code = 'MOD-LIONS_MANE');

-- 2) Blueberry ฿25 -> ฿20 to match the POS price.
UPDATE nomenclature_modifier_options
SET price_delta = 20
WHERE modifier_id = (SELECT id FROM nomenclature WHERE product_code = 'MOD-BLUEBERRY')
  AND price_delta = 25;

-- 3) Add Almond/Oat Milk to the three Base Upgrade groups from the Loyverse mirror.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, price_delta, is_default, sort_order, quantity_per_unit,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT g.dish_id, modn.id, o.price, false, 100, 1,
       o.id::text, ml.id::text, ml.name
FROM dish_modifier_groups g
JOIN pos_loyverse_modifier_lists   ml ON ml.id = g.loyverse_modifier_list_id
JOIN pos_loyverse_modifier_options o  ON o.list_id = ml.id
JOIN (VALUES ('Almond Milk','MOD-MILK_ALMOND'),
             ('Oat Milk','MOD-MILK_OAT')) AS mapn(option_name, mod_code)
  ON mapn.option_name = o.name
JOIN nomenclature modn ON modn.product_code = mapn.mod_code
WHERE ml.id IN (
  'a7b51226-1c97-4310-948f-7c5a008d3775',  -- Base Upgrade (from Milk)
  'ae08eb2b-5d75-4063-a067-ec29df159d4e',  -- Base Upgrade (from Water)
  '4a3c0561-0091-41ce-b549-752c3bd37c45'   -- Base Upgrade (from Yogurt)
)
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, status)
VALUES ('289_smoothie_modifier_reconcile.sql', 'manual', 'success')
ON CONFLICT DO NOTHING;

COMMIT;
