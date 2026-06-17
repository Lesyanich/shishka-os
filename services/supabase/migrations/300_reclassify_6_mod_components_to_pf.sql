-- 300_reclassify_6_mod_components_to_pf.sql
-- Data-health (data_health project): 6 items prefixed MOD- (type='modifier') are in
-- fact semi-finished COMPONENTS — they have their own BOM and are used as ingredients
-- inside SALE recipes, never offered to customers as add-ons (0 modifier_options).
-- Reclassify them to the PF tier so prefix ↔ type ↔ role are consistent and they stop
-- appearing in the /menu MOD filter chips.
--
-- For each: product_code MOD- -> PF-, type 'modifier' -> 'semi_finished', and assign a
-- PF prep category (best-effort; chef may refine):
--   Cooked Components  (KP-PRP-RCK): RED_BEANS, SHRIMP_SOUSVIDE, ANCIENT_CRUNCH
--   Cut Vegetables     (KP-PRP-CUT): GREENS
--   Marinades & Mixes  (KP-PRP-MRN): SESAME_COATING, HUMMUS_GARNISH
--
-- Safety: all relationships are by UUID (bom_structures, nomenclature_modifier_options)
-- so the rename doesn't break BOM/cost. No loyverse_item_id on any (not in Loyverse).
-- Only one runtime code reference exists — saladBarGrid.ts uses 'MOD-RED_BEANS' — and is
-- updated in the same commit. Collision-checked: no PF- target code pre-exists.
--
-- The 3 ambiguous "(Add-on)"-style items (MOD-SOUR_CREAM, MOD-COCONUT_YOGURT,
-- MOD-SOUSVIDE_CHICKEN) are intentionally NOT touched — whether they should be real
-- customer add-ons (stay MOD) or components (-> PF) is a menu decision left to chef.
--
-- Reversible: rename back to MOD-, type 'modifier', restore prior KP-TOP-* category.

BEGIN;

-- Cooked Components
UPDATE nomenclature
   SET product_code = 'PF-' || substring(product_code from 5),
       type        = 'semi_finished',
       category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-RCK'),
       updated_at  = now()
 WHERE product_code IN ('MOD-RED_BEANS', 'MOD-SHRIMP_SOUSVIDE', 'MOD-ANCIENT_CRUNCH');

-- Cut Vegetables
UPDATE nomenclature
   SET product_code = 'PF-' || substring(product_code from 5),
       type        = 'semi_finished',
       category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-CUT'),
       updated_at  = now()
 WHERE product_code = 'MOD-GREENS';

-- Marinades & Mixes
UPDATE nomenclature
   SET product_code = 'PF-' || substring(product_code from 5),
       type        = 'semi_finished',
       category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-MRN'),
       updated_at  = now()
 WHERE product_code IN ('MOD-SESAME_COATING', 'MOD-HUMMUS_GARNISH');

INSERT INTO migration_log (filename, status)
VALUES ('300_reclassify_6_mod_components_to_pf.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
