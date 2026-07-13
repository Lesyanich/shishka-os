-- 359_thai_tea_modifiers_and_price.sql
-- Finalize the 5 Thai milk teas (created via chef MCP after migration 358):
--   1. Seed an ESTIMATED Makro price for the new Thai tea powder so cost rolls up.
--      Trigger fn_sc_seed_raw_cost → cost_per_unit = last_seen_price / conversion_factor,
--      cost_source = 'catalog_estimate'.  100 THB / 0.4 kg-per-bag = 250 THB/kg.
--   2. Attach the existing "Milk" modifier group (Loyverse list 8105066d: Cow ฿0 base,
--      Oat/Almond/Coconut +฿25, max 1) to all 5 teas — same pattern as the iced lattes.

BEGIN;

-- 1. Estimated supplier price for the Thai tea powder (Makro). conversion_factor set
--    explicitly (0.4 kg per 400 g bag) so the seed trigger computes 250 THB/kg.
INSERT INTO supplier_catalog
  (supplier_id, nomenclature_id, last_seen_price, conversion_factor,
   purchase_unit, package_weight, product_name, brand, source)
SELECT 'c548db19-8a70-4f34-96af-d66162793cbf', n.id, 100, 0.4,
       'bag', '400 g', 'ChaTraMue Original Thai Tea Mix 400g', 'ChaTraMue', 'estimate'
FROM nomenclature n
WHERE n.product_code = 'RAW-TEA_THAI_POWDER'
  AND NOT EXISTS (
    SELECT 1 FROM supplier_catalog sc
    WHERE sc.nomenclature_id = n.id
      AND sc.supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  );

-- 2. Attach the Milk modifier group to all 5 Thai teas
INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT n.id, '8105066d-7e6d-403f-b737-efb3b3a17a1c', 0, 0, 1
FROM nomenclature n
WHERE n.product_code IN (
        'SALE-TEA_THAI_HONEY','SALE-TEA_THAI_MINT','SALE-TEA_THAI_HAZELNUT',
        'SALE-TEA_THAI_VANILLA','SALE-TEA_THAI_CARAMEL')
  AND NOT EXISTS (
    SELECT 1 FROM dish_modifier_groups dmg
    WHERE dmg.dish_id = n.id
      AND dmg.loyverse_modifier_list_id = '8105066d-7e6d-403f-b737-efb3b3a17a1c'
  );

INSERT INTO migration_log (filename, notes)
VALUES ('359_thai_tea_modifiers_and_price.sql',
        'Estimated Thai tea powder price (250 THB/kg); Milk modifier group on 5 Thai teas');

COMMIT;
