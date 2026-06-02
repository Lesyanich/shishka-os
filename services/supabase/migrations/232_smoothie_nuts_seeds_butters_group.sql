-- ═══════════════════════════════════════════════════════════
-- 232_smoothie_nuts_seeds_butters_group.sql
-- Move Peanut Butter, Cashew Butter, Almond Slices, Chia Seeds out of
-- Boosters / Extra Fruit / Pick Fruits into a dedicated Loyverse list
-- "Nuts, Seeds & Butters" (done via API), and re-bind accordingly.
-- New prices: pastes THB 30, Almond/Chia THB 20. Attached to all 9 smoothies.
--
-- NOTE: the Loyverse-side restructure (create list, remove options, recreate
-- the 9 smoothie items with the new list) was applied via the loyverse-sync
-- edge function. This migration only re-syncs the local bindings mirror.
-- Also fixes: Loyverse item modifier field is `modifier_ids` (not `modifiers_ids`).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop stale bindings for the 4 relocated modifiers (old option ids deleted).
DELETE FROM nomenclature_modifier_options
WHERE modifier_id IN (
  SELECT id FROM nomenclature
  WHERE product_code IN ('MOD-PEANUT_BUTTER_ADD','MOD-CASHEW_BUTTER_ADD','MOD-ALMOND_SLICES','MOD-CHIA_SEEDS')
);

-- 2. Re-bind the new "Nuts, Seeds & Butters" group to all 9 smoothies.
WITH grp AS (
  SELECT id FROM pos_loyverse_modifier_lists WHERE name = 'Nuts, Seeds & Butters'
),
opt_map(option_name, mod_code) AS (
  VALUES
    ('Peanut Butter', 'MOD-PEANUT_BUTTER_ADD'),
    ('Cashew Butter', 'MOD-CASHEW_BUTTER_ADD'),
    ('Almond Slices', 'MOD-ALMOND_SLICES'),
    ('Chia Seeds',    'MOD-CHIA_SEEDS')
),
smoothies AS (
  SELECT id FROM nomenclature WHERE product_code LIKE 'SALE-SMOOTHIE_%'
)
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, slot, quantity_per_unit, price_delta, is_default, sort_order,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT
  s.id, modn.id, NULL, 1, COALESCE(o.price, 0), false,
  ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY o.name),
  o.id, o.list_id, l.name
FROM smoothies s
CROSS JOIN grp
JOIN pos_loyverse_modifier_options o ON o.list_id = grp.id
JOIN pos_loyverse_modifier_lists   l ON l.id = o.list_id
JOIN opt_map om               ON om.option_name = o.name
JOIN nomenclature modn        ON modn.product_code = om.mod_code
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '232_smoothie_nuts_seeds_butters_group.sql',
  'claude-code',
  NULL,
  'Relocate pastes + almond/chia into new Nuts, Seeds & Butters Loyverse list; re-bind to 9 smoothies; modifier_ids field fix'
)
ON CONFLICT DO NOTHING;

COMMIT;
