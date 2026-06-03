-- ═══════════════════════════════════════════════════════════
-- 234_protein_peach_yogurt_base.sql
-- Protein Peach redesigned to a YOGURT base (CEO 2026-06-02): replace the
-- 150 ml cow milk with 150 g Greek yogurt (keeps whey + peanut butter — the
-- "protein"). Modifier base list swapped from "from Milk" to "from Yogurt"
-- via loyverse-sync update_item (in-place). This migration: BOM swap + re-bind.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. Recipe: cow milk → Greek yogurt (150 ml → 150 g)
UPDATE bom_structures
SET ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-YOGURT-GREEK'),
    quantity_per_unit = 0.150
WHERE parent_id = (SELECT id FROM nomenclature WHERE product_code = 'SALE-SMOOTHIE_PROTEIN_PEACH')
  AND ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-MILK-COW');

-- 2. Drop old "from Milk" base bindings for Protein Peach
DELETE FROM nomenclature_modifier_options
WHERE dish_id = (SELECT id FROM nomenclature WHERE product_code = 'SALE-SMOOTHIE_PROTEIN_PEACH')
  AND loyverse_modifier_list_name = 'Base Upgrade (from Milk)';

-- 3. Add "from Yogurt" base bindings for Protein Peach
WITH grp AS (SELECT id FROM pos_loyverse_modifier_lists WHERE name = 'Base Upgrade (from Yogurt)'),
opt_map(option_name, mod_code) AS (
  VALUES ('Cow Milk','MOD-MILK_COW'), ('Coconut Milk','MOD-MILK_COCONUT'), ('Water','MOD-BASE_WATER')
),
dish AS (SELECT id FROM nomenclature WHERE product_code = 'SALE-SMOOTHIE_PROTEIN_PEACH')
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, slot, quantity_per_unit, price_delta, is_default, sort_order,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT s.id, modn.id, 'base', 1, COALESCE(o.price,0), false,
  ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY o.name),
  o.id, o.list_id, l.name
FROM dish s
CROSS JOIN grp
JOIN pos_loyverse_modifier_options o ON o.list_id = grp.id
JOIN pos_loyverse_modifier_lists   l ON l.id = o.list_id
JOIN opt_map om               ON om.option_name = o.name
JOIN nomenclature modn        ON modn.product_code = om.mod_code
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '234_protein_peach_yogurt_base.sql',
  'claude-code',
  NULL,
  'Protein Peach: milk 150ml -> Greek yogurt 150g; base list from Milk -> from Yogurt (keeps whey + peanut butter)'
)
ON CONFLICT DO NOTHING;

COMMIT;
