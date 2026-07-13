-- 361_fix_chocolate_section_and_drinks_order.sql
-- Two menu-taxonomy fixes, both data-only (product_categories sort_order/parent).
--
-- A) Chocolate was misparented. KP-FIN-CHO ("🍫 Chocolate") carries a KP-FIN
--    (finished-food) code and its own Loyverse category, but its parent_id was
--    wrongly set to KP-DRK (🧋 Drinks) with is_menu_section=false — so the 25
--    Barada chocolate BARS (3 web-visible) rendered as a drinks subcategory,
--    splitting the drinks menu between Smoothies and Matcha. It's confectionery,
--    not a beverage. Re-home it under KP-FIN (Finished Dishes) and promote it to
--    its own top-level menu section so it reads as "🍫 Chocolate" on the site and
--    in admin /menu, out of Drinks. Loyverse untouched (separate category there).
--
-- B) Define the drinks subcategory display order the owner wants. Both the site
--    (menu_public.category_sort_order) and admin (useMenuData) order in-section
--    subcategories by the category's sort_order:
--      Smoothies → Juices → Lemonades → Coffee → Matcha → Shots → Soft Drinks
--
-- Idempotent (plain UPDATEs to known codes) and reversible.

-- A) Chocolate → its own menu section under Finished Dishes
UPDATE public.product_categories
SET parent_id       = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN'),
    is_menu_section = true,
    sort_order      = 8,
    updated_at      = now()
WHERE code = 'KP-FIN-CHO';

-- B) Drinks subcategory order
UPDATE public.product_categories SET sort_order = 1, updated_at = now() WHERE code = 'KP-DRK-SMT'; -- 🥤 Smoothies
UPDATE public.product_categories SET sort_order = 2, updated_at = now() WHERE code = 'KP-FIN-JCE'; -- 🧃 Juices
UPDATE public.product_categories SET sort_order = 3, updated_at = now() WHERE code = 'KP-DRK-LEM'; -- 🍋 Lemonades
UPDATE public.product_categories SET sort_order = 4, updated_at = now() WHERE code = 'KP-DRK-COF'; -- ☕ Coffee
UPDATE public.product_categories SET sort_order = 5, updated_at = now() WHERE code = 'KP-DRK-MAT'; -- 🍵 Matcha
UPDATE public.product_categories SET sort_order = 6, updated_at = now() WHERE code = 'KP-DRK-SHT'; -- ⚡ Shots
UPDATE public.product_categories SET sort_order = 7, updated_at = now() WHERE code = 'KP-DRK-SOF'; -- 🥤 Soft Drinks

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '361_fix_chocolate_section_and_drinks_order.sql',
  'claude-code',
  NULL,
  'Fix: KP-FIN-CHO Chocolate re-homed under KP-FIN as its own menu section (was misparented under KP-DRK Drinks). Set drinks subcategory order: Smoothies, Juices, Lemonades, Coffee, Matcha, Shots, Soft Drinks. Data-only.'
)
ON CONFLICT DO NOTHING;
