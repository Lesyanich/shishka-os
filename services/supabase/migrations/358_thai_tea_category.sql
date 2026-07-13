-- 358_thai_tea_category.sql
-- New "🧋 Thai Tea" drinks section + repurpose the empty Thai-tea stub
-- (was SALE-TEA_THAI_BROWN_SUGAR) into the Honey variant.
--
-- Context: CEO line of 5 syrup-sweetened Thai milk teas (Honey/Mint/Hazelnut/
-- Vanilla/Caramel). Brown sugar + sweetened condensed milk were dropped — the
-- condensed product is ~10% palm oil, off-brand for a healthy kitchen. Sweetness
-- now comes from house/MONIN syrups; body from cow milk (swap group attached in 359).

BEGIN;

-- 1. New menu section under the Drinks parent (sibling of Coffee/Matcha/Lemonades…)
INSERT INTO product_categories
  (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section)
SELECT 'KP-DRK-TEA', '🧋 Thai Tea', 'ชาไทย',
       'affe39cf-60bc-46da-86fc-04987f0cc8aa', 3, 8, 4150, true, false
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-DRK-TEA');

-- 2. Repurpose the empty/unpublished stub → Honey variant, into the new category.
--    Old code carried "BROWN_SUGAR" which no longer reflects the recipe.
UPDATE nomenclature
SET category_id  = (SELECT id FROM product_categories WHERE code = 'KP-DRK-TEA'),
    product_code = 'SALE-TEA_THAI_HONEY',
    name         = '🧋 Thai Milk Tea — Honey',
    base_unit    = 'pcs'
WHERE id = '68ce8ce2-0e15-4cec-aef5-c972d5ee1c9d';

INSERT INTO migration_log (filename, notes)
VALUES ('358_thai_tea_category.sql',
        'New KP-DRK-TEA Thai Tea section; repurposed brown-sugar stub into Honey variant');

COMMIT;
