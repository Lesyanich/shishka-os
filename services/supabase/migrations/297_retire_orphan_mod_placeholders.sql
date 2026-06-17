-- 297_retire_orphan_mod_placeholders.sql
-- Retire the 2 genuinely-orphan MOD placeholders (MOD-ADDONS_PROTEIN, MOD-TOPPINGS):
-- 0 dish links, 0 modifier-option rows, 0 BOM references, no loyverse_item_id, draft.
-- Soft-delete only (is_deleted = true) — fully reversible, no Loyverse/site impact.
--
-- IMPORTANT CONTEXT (cleanup task a3b59e0e): the other 9 candidates flagged as "dead
-- (0 dishes)" turned out to be LIVE BOM ingredients / sub-assemblies and are KEPT:
--   MOD-SESAME_COATING  — ingredient in 8 dough recipes ("sesame is part of the recipe")
--   MOD-ANCIENT_CRUNCH, MOD-COCONUT_YOGURT, MOD-GREENS, MOD-HUMMUS_GARNISH,
--   MOD-RED_BEANS, MOD-SHRIMP_SOUSVIDE, MOD-SOUR_CREAM, MOD-SOUSVIDE_CHICKEN
--     — each used as a BOM ingredient and/or has BOM children.
-- Deleting any of those would break recipes/cost rollups, so they stay.
--
-- Self-protecting guards: this UPDATE will only fire for rows that are truly orphan
-- AND not Loyverse-synced — if reality differs, it no-ops rather than damaging data.

BEGIN;

UPDATE nomenclature n
   SET is_deleted = true, updated_at = now()
 WHERE n.product_code IN ('MOD-ADDONS_PROTEIN', 'MOD-TOPPINGS')
   AND n.is_deleted = false
   AND n.loyverse_item_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM nomenclature_modifier_options o
      WHERE o.modifier_id = n.id OR o.dish_id = n.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM bom_structures b
      WHERE b.ingredient_id = n.id OR b.parent_id = n.id
   );

INSERT INTO migration_log (filename, status)
VALUES ('297_retire_orphan_mod_placeholders.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
