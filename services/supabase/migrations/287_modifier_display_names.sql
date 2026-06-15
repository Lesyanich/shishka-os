-- 287_modifier_display_names.sql
-- Polish customer-facing modifier option names (web display only; POS unaffected).
-- menu_modifiers shows COALESCE(customer_short_name, name), so we set short names.
--   MOD-SYRUP_MAPLE     "Add Maple Syrup" -> "Maple Syrup"
--   MOD-ESPRESSO_EXTRA  "Extra Shot"      -> "Extra Espresso Shot"
--   MOD-COFFEE_MCT      "Add MCT Oil"     -> "MCT Oil"

BEGIN;

UPDATE nomenclature SET customer_short_name = 'Maple Syrup'
WHERE product_code = 'MOD-SYRUP_MAPLE';

UPDATE nomenclature SET customer_short_name = 'Extra Espresso Shot'
WHERE product_code = 'MOD-ESPRESSO_EXTRA';

UPDATE nomenclature SET customer_short_name = 'MCT Oil'
WHERE product_code = 'MOD-COFFEE_MCT';

INSERT INTO migration_log (filename, applied_by, status)
VALUES ('287_modifier_display_names.sql', 'manual', 'success')
ON CONFLICT DO NOTHING;

COMMIT;
