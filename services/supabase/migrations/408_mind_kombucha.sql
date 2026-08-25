-- ═══════════════════════════════════════════════════════════
-- 408_mind_kombucha.sql
--
-- Sell Mind Kombucha (Thai fermented-tea brand) as a resale bottled drink.
-- CEO request 2026-08-25, MC task f4bb6417.
--
-- 5 SKUs, no BOM — these are bought finished and resold as-is:
--   4 x 250 ml sparkling glass bottle @ 110 THB
--     (Original, Lychee, Honey & Ginger, Yuzu & Peach — the brand's full
--      bottled line, verified against Tops and thegivingtown listings)
--   1 x ginger shot, small amber bottle @ 60 THB
--     (identified from a photo of our own fridge; the brand publishes no
--      online listing for it, so portion_size is left NULL until someone
--      reads the back label)
--
-- New guest-menu section rather than reusing KP-DRK-SOF: Soft Drinks holds
-- Coca-Cola / Fanta / Sprite, which are deliberately kept off the public
-- menu. CEO chose "Kombucha" as its own section.
--
-- Numbering: repo max file is 399, but production migration_log max is 407
-- (files 400-407 applied from unmerged branches). Per vault/Database/
-- Migrations.md a gap is never reused, so this takes 408.
--
-- cost_per_unit is deliberately NULL / cost_source='none': a wholesale deal
-- exists but the per-bottle price has not been supplied. Tops retails the
-- 250 ml at exactly our 110 THB shelf price, so margin on these SKUs is
-- unknown until that number lands. Follow-up task tracks it.
--
-- is_web_visible = false even though the CEO asked for "POS + website". The
-- website gate is nomenclature.is_web_visible (see 384_menu_public_contract.sql
-- — NOT is_menu_section, which only picks the section heading). All 87 rows
-- currently live in menu_public carry calories; publishing these 5 with NULL
-- nutrition would make them the only blanks on the page. Flipping the flag is a
-- one-line UPDATE once the back labels are read.
--
-- Idempotent: ON CONFLICT guards on category code and product_code.
--
-- CONTRACT-REVIEWED: adds no column and changes no view — menu_public is only
-- named in a comment. The 5 new rows carry is_web_visible=false, so they do not
-- enter the view at all: contract-check.mjs reports menu_public at 87 rows both
-- before and after this migration, green on the Supabase and shishka.health
-- endpoints. Publishing later is a data change (UPDATE), not a contract change.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. New L3 guest-menu section under the Drinks umbrella (KP-DRK).
--    is_menu_section = true so menu_public resolves these dishes to their own
--    "🍾 Kombucha" section instead of folding them into the parent.
INSERT INTO product_categories
  (code, name, name_th, parent_id, level, sort_order,
   default_fin_sub_code, is_active, is_menu_section)
SELECT 'KP-DRK-KMB', '🍾 Kombucha', 'คอมบูชะ',
       (SELECT id FROM product_categories WHERE code = 'KP-DRK'),
       3, 29, 4150, true, true
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-DRK-KMB');

-- 2. The 5 resale SKUs.
INSERT INTO nomenclature
  (product_code, name, type, category_id, base_unit,
   price, cost_per_unit, cost_source,
   portion_size, portion_unit,
   is_available, stock_state, pos_status,
   is_web_visible, is_featured)
SELECT v.product_code, v.name, 'dish',
       (SELECT id FROM product_categories WHERE code = 'KP-DRK-KMB'),
       'pcs',
       v.price, NULL, 'none',
       v.portion_size::numeric, v.portion_unit,
       true, 'in_stock', 'approved'::pos_status_enum,
       false, false
FROM (VALUES
  ('SALE-KOMBUCHA_ORIGINAL',     '🍾 Mind Kombucha — Original',      110, '250', 'ml'),
  ('SALE-KOMBUCHA_LYCHEE',       '🍾 Mind Kombucha — Lychee',        110, '250', 'ml'),
  ('SALE-KOMBUCHA_HONEY_GINGER', '🍾 Mind Kombucha — Honey & Ginger', 110, '250', 'ml'),
  ('SALE-KOMBUCHA_YUZU_PEACH',   '🍾 Mind Kombucha — Yuzu & Peach',  110, '250', 'ml'),
  ('SALE-KOMBUCHA_GINGER_SHOT',  '🫚 Mind Kombucha — Ginger Shot',     60, NULL,  NULL)
) AS v(product_code, name, price, portion_size, portion_unit)
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '408_mind_kombucha.sql',
  'claude-code',
  'Mind Kombucha resale line: new KP-DRK-KMB section + 5 SALE-KOMBUCHA_* SKUs (4x250ml @110, ginger shot @60). Cost pending wholesale price; is_web_visible=false pending back-label nutrition.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
