-- 250: Manakish bundles (×4 / ×8 / ×12 "build-your-own" sets)
-- Project: Menu Control — bundles
--
-- Adds a "🎁 Bundles" category and three configurable bundle dishes. These are
-- "build-your-own" SALE items with NO fixed price: the customer picks which
-- manakish (from KP-FIN-MAN) and the price is computed at order time as
-- Σ(manakish price) × (1 − discount), with the included sauce(s) free.
--
-- Why no fixed price: like the Custom Smoothie, the bundle price depends on the
-- selection. `price` is left NULL on purpose — the ordering flow (create-order)
-- is the single authority for the computed total. See packages/contracts/src/bundles.ts.
--
-- POS note: bundles are NOT pushed as Loyverse items (pos_status stays 'draft').
-- At the register the cashier applies a native Loyverse percentage discount,
-- because Loyverse modifiers cannot express repeats-of-the-same-flavour at a
-- variable price.

-- 1) Bundles category (sibling of 🫓 Manaish under the same parent)
INSERT INTO public.product_categories (code, name, parent_id, level, sort_order, default_fin_sub_code, is_active)
SELECT 'KP-FIN-BND', '🎁 Bundles', parent_id, level, 1, default_fin_sub_code, true
FROM public.product_categories
WHERE code = 'KP-FIN-MAN'
ON CONFLICT (code) DO NOTHING;

-- 2) Three bundle dishes (idempotent on product_code)
INSERT INTO public.nomenclature
  (product_code, name, type, category_id, is_available, price, pos_status,
   customer_short_name, customer_description, is_featured)
SELECT b.product_code, b.name, 'dish', c.id, true, NULL, 'draft',
       b.short_name, b.descr, true
FROM (VALUES
  ('SALE-BUNDLE_MANAKISH_4',  'Manakish Bundle ×4',  'Bundle ×4',
     'Pick any 4 manakish + 1 sauce — cheaper than à la carte.'),
  ('SALE-BUNDLE_MANAKISH_8',  'Manakish Bundle ×8',  'Bundle ×8',
     'Pick any 8 manakish + 2 sauces — cheaper than à la carte.'),
  ('SALE-BUNDLE_MANAKISH_12', 'Manakish Bundle ×12', 'Bundle ×12',
     'Pick any 12 manakish + 3 sauces — cheaper than à la carte.')
) AS b(product_code, name, short_name, descr)
CROSS JOIN (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BND') c
ON CONFLICT (product_code) DO NOTHING;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '250_manakish_bundles.sql',
  'claude-code',
  NULL,
  'Add 🎁 Bundles category + 3 build-your-own manakish bundle dishes (price NULL = computed at order time)'
)
ON CONFLICT DO NOTHING;
