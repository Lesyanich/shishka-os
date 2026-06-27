-- 321_matcha_drink_section.sql
-- Carve matcha out into its own drinks subcategory.
--
-- Today the matcha drinks are scattered: 5 sit under ☕ Coffee (KP-DRK-COF) and
-- 1 (Matcha Green Smoothie) under 🥤 Smoothies. The owner wants matcha to read as
-- its own section everywhere — admin /menu chips AND the customer site.
--
-- Both surfaces are 100% data-driven from product_categories:
--   * site  → menu_public derives the section from the nearest is_menu_section
--             ancestor; the dish's own category becomes the in-section grouping.
--   * admin → useMenuData groups dishes by category and orders by sort_order.
-- So a new L3 category under 🧋 Drinks (KP-DRK) + re-pointing category_id is all
-- that's needed — no frontend change.
--
-- Position: sort_order = 2, i.e. right after ☕ Coffee (sort_order 1).
-- Loyverse is intentionally left untouched (loyverse_category_id stays NULL);
-- Loyverse categories are managed separately and the sync ignores category_id.
--
-- Idempotent + reversible (re-point reverses by setting category_id back).

-- 1) New subcategory under 🧋 Drinks
INSERT INTO public.product_categories
  (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section)
SELECT
  'KP-DRK-MAT', '🍵 Matcha', 'มัทฉะ',
  (SELECT id FROM public.product_categories WHERE code = 'KP-DRK'),
  3, 2, 4150, true, false
ON CONFLICT (code) DO NOTHING;

-- 2) Re-point every matcha drink to the new category
UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-DRK-MAT'),
    updated_at  = now()
WHERE product_code IN (
  'SALE-MATCHA_LATTE',
  'SALE-MATCHA_ICED_LATTE',
  'SALE-MATCHA_ICED_DIRTY',
  'SALE-MATCHA_ICED_COCONUT',
  'SALE-MATCHA_DIRTY',
  'SALE-SMOOTHIE_MATCHA_GREEN'
);

-- 3) Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '321_matcha_drink_section.sql',
  'claude-code',
  NULL,
  'New 🍵 Matcha drinks subcategory (KP-DRK-MAT, sort_order 2 after Coffee); re-pointed 6 matcha dishes (5 from Coffee + Matcha Green Smoothie). Data-only; site + admin pick it up automatically.'
)
ON CONFLICT DO NOTHING;
