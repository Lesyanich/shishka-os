-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 148: Manaish category — signature dish gets its own L3
-- MC c0a28e3f. Fixes miscategorization of signature manaish dishes.
--
-- Before:
--   SALE-MANIKISH_MEAT       → F (Food, raw ingredients root — wrong)
--   SALE-MANAISH-CHEESE      → NULL (falls through to "More")
--   SALE-MANAISH-CHICKEN-SHRIMP, PIZZA, MEAT, ZAATAR → NULL
--
-- After: all 6 SALE manaish dishes under KP-FIN-MAN (Manaish).
-- Sort order 0 so "Manaish" leads the finished-dishes tab strip.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Create the category under KP-FIN (Finished Dishes)
INSERT INTO public.product_categories
  (code, name, level, parent_id, sort_order, default_fin_sub_code, is_active)
SELECT 'KP-FIN-MAN', 'Manaish', 3, id, 0, 4150, true
FROM public.product_categories
WHERE code = 'KP-FIN'
ON CONFLICT (code) DO NOTHING;

-- 2. Reassign the signature dishes
UPDATE public.nomenclature
SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN')
WHERE product_code IN (
  'SALE-MANIKISH_MEAT',
  'SALE-MANAISH-CHEESE',
  'SALE-MANAISH-CHICKEN-SHRIMP',
  'SALE-MANAISH-PIZZA',
  'SALE-MANAISH-MEAT',
  'SALE-MANAISH-ZAATAR'
);

-- 3. Safety check: all 6 dishes must now resolve to KP-FIN-MAN
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*)
  INTO cnt
  FROM public.nomenclature n
  JOIN public.product_categories pc ON n.category_id = pc.id
  WHERE pc.code = 'KP-FIN-MAN';

  IF cnt <> 6 THEN
    RAISE EXCEPTION 'Manaish category: expected 6 dishes, got %', cnt;
  END IF;
END $$;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '148_manaish_category.sql',
  'claude-code',
  'KP-FIN-MAN (Manaish) L3 category + reassign 6 SALE manaish dishes out of F / NULL.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
