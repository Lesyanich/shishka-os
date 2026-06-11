-- ═══════════════════════════════════════════════════════════
-- 233_smoothie_base_from_yogurt.sql
-- New Loyverse group "Base Upgrade (from Yogurt)" for yogurt-based smoothies:
-- both milk and water are DOWNGRADES (negative price).
--   Cow Milk -10, Coconut Milk -10, Water -30
-- Created + attached to Peach Apricot (yogurt+milk base) via loyverse-sync
-- (create_modifier + in-place update_item). This migration syncs local bindings.
-- Protein Peach is NOT yogurt-based (whey protein + peanut butter on milk) —
-- left on "from Milk"; revisit only if its recipe is redesigned.
-- ═══════════════════════════════════════════════════════════

BEGIN;

WITH grp AS (
  SELECT id FROM pos_loyverse_modifier_lists WHERE name = 'Base Upgrade (from Yogurt)'
),
opt_map(option_name, mod_code) AS (
  VALUES
    ('Cow Milk',     'MOD-MILK_COW'),
    ('Coconut Milk', 'MOD-MILK_COCONUT'),
    ('Water',        'MOD-BASE_WATER')
),
yogurt_dishes AS (
  SELECT id FROM nomenclature WHERE product_code IN ('SALE-SMOOTHIE_PEACH_APRICOT')
)
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, slot, quantity_per_unit, price_delta, is_default, sort_order,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT
  s.id, modn.id, 'base', 1, COALESCE(o.price, 0), false,
  ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY o.name),
  o.id, o.list_id, l.name
FROM yogurt_dishes s
CROSS JOIN grp
JOIN pos_loyverse_modifier_options o ON o.list_id = grp.id
JOIN pos_loyverse_modifier_lists   l ON l.id = o.list_id
JOIN opt_map om               ON om.option_name = o.name
JOIN nomenclature modn        ON modn.product_code = om.mod_code
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '233_smoothie_base_from_yogurt.sql',
  'claude-code',
  NULL,
  'Base Upgrade (from Yogurt) group: Cow Milk/Coconut -10, Water -30; bound to Peach Apricot. Protein Peach stays milk (whey-based).'
)
ON CONFLICT DO NOTHING;

COMMIT;
