-- 291_split_appetizers_dips_subcategories.sql
-- Split the "🥟 Appetizers & Dips" umbrella into its two existing subcategories
-- (🥟 Appetizers & Sides, 🥣 Dips). Both subcats already exist and map to live
-- Loyverse categories, but were inactive and empty — all 15 SALE dishes hung
-- directly on the umbrella, so admin showed them as one flat group while
-- Loyverse and the site already had them separate.
--
-- After this migration:
--   • "🥟 Appetizers & Dips" (KP-FIN-APD) stays the menu SECTION
--     (is_menu_section = true), so menu_public still rolls everything up under it.
--   • The two subcategories are re-activated and each dish is reassigned to the
--     right one. In admin /menu the section strip shows "Appetizers & Dips" and
--     the drill-down sub-strip shows "Appetizers & Sides" / "Dips".
--
-- Reversible: re-point the 15 dishes back to '6aba80a2-…' and deactivate the
-- two subcategories.

BEGIN;

-- 1. Re-activate the two subcategories (Appetizers first, then Dips).
UPDATE product_categories
   SET is_active = true, is_menu_section = false, sort_order = 1, updated_at = now()
 WHERE id = '6ce91704-c744-493c-9a09-0a63bdc94171'; -- KP-FIN-APT 🥟 Appetizers & Sides

UPDATE product_categories
   SET is_active = true, is_menu_section = false, sort_order = 2, updated_at = now()
 WHERE id = '570d2bf8-6a5f-4491-b9aa-ff3bbb0b327d'; -- KP-FIN-DIP 🥣 Dips

-- 2. Reassign the dip dishes → 🥣 Dips
UPDATE nomenclature
   SET category_id = '570d2bf8-6a5f-4491-b9aa-ff3bbb0b327d', updated_at = now()
 WHERE product_code IN (
   'SALE-HUMMUS_PLAIN', 'SALE-HUMMUS_BEETROOT', 'SALE-HUMMUS_PESTO',
   'SALE-HUMMUS_BUNS', 'SALE-HUMMUS_CRACKERS',
   'SALE-MUHAMMARA', 'SALE-MUHAMMARA_BUNS', 'SALE-MUTABAL', 'SALE-GUACAMOLE'
 )
   AND category_id = '6aba80a2-1634-4e25-a457-e60623fdec57'; -- only move from the umbrella

-- 3. Reassign the appetizer / side dishes → 🥟 Appetizers & Sides
UPDATE nomenclature
   SET category_id = '6ce91704-c744-493c-9a09-0a63bdc94171', updated_at = now()
 WHERE product_code IN (
   'SALE-BAKED_POTATO_SIDE',
   'SALE-MASH_POTATO_CLASSIC_SIDE', 'SALE-MASH_POTATO_VEGAN_SIDE',
   'SALE-SUMMER_ROLLS_CHICKEN', 'SALE-SUMMER_ROLLS_SHRIMP', 'SALE-SUMMER_ROLLS_VEGGIE'
 )
   AND category_id = '6aba80a2-1634-4e25-a457-e60623fdec57'; -- only move from the umbrella

INSERT INTO migration_log (filename, status)
VALUES ('291_split_appetizers_dips_subcategories.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
