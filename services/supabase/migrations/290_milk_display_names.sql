-- 290_milk_display_names.sql
-- Clean web display names for milk options. The MOD-MILK_* products are named
-- "Swap to X Milk" (POS phrasing); on the website's radio "Milk" group and the
-- smoothie "Base Upgrade" groups that reads awkwardly. Set customer_short_name
-- to the bare milk name (menu_modifiers shows COALESCE(customer_short_name, name)).
-- POS unaffected (POS uses the Loyverse option names, not these).

BEGIN;

UPDATE nomenclature SET customer_short_name = 'Cow Milk'     WHERE product_code = 'MOD-MILK_COW';
UPDATE nomenclature SET customer_short_name = 'Almond Milk'  WHERE product_code = 'MOD-MILK_ALMOND';
UPDATE nomenclature SET customer_short_name = 'Coconut Milk' WHERE product_code = 'MOD-MILK_COCONUT';
UPDATE nomenclature SET customer_short_name = 'Oat Milk'     WHERE product_code = 'MOD-MILK_OAT';
UPDATE nomenclature SET customer_short_name = 'Soy Milk'     WHERE product_code = 'MOD-MILK_SOY';

INSERT INTO migration_log (filename, applied_by, status)
VALUES ('290_milk_display_names.sql', 'manual', 'success')
ON CONFLICT DO NOTHING;

COMMIT;
