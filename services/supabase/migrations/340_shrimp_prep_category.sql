-- 340_shrimp_prep_category.sql
-- Create a dedicated "🦐 Shrimp" prep category (KP-PRP-SHR) and consolidate ALL
-- shrimp semi-finished preps into it, so cooks see every shrimp portion in one
-- cook-legible bucket on /menu?view=l1-cook and /kitchen/recipes.
--
-- WHY THIS EXISTS: the three shrimp preps were scattered ->
--   • PF-SHRIMP_GRILLED      -> Cooked Components (KP-PRP-RCK)   [cooked]
--   • PF-SHRIMP_SOUSVIDE     -> Cooked Components (KP-PRP-RCK)   [cooked]
--   • PF-SHRIMP_MARINATED_FZ -> NULL / Uncategorized             [raw, sear path]
-- The raw marinated portion had no home (its name is literally "…Raw, Frozen", so
-- "Cooked Components" was the wrong axis for it), and the dual-prep shrimp model
-- (marinated-sear + sous-vide-cold, see project_shrimp_dual_prep_model) split its
-- two halves across two buckets. CEO decision 2026-07-01: category names must be
-- cook-legible; group the shrimp preps by protein under one "Shrimp" category.
--
-- This intentionally SUPERSEDES the note in migration 301, which parked cooked
-- proteins (incl. grilled shrimp) inside KP-PRP-RCK and explicitly chose NOT to
-- split a proteins bucket. We now carve shrimp out — by protein, for cook clarity.
-- (Raw shrimp *ingredients* RAW-SHRIMP* stay in Seafood / F-PRO-SEA — that is the
-- ingredient taxonomy, a different branch; only semi_finished preps move here.)
--
-- L3 categories require default_fin_sub_code (chk_l3_fin_sub_code); siblings use 4150.
-- Idempotent: category inserted only WHERE NOT EXISTS; the 3 UPDATEs are guarded by
-- `category_id IS DISTINCT FROM` the new category, so a re-run is a no-op.
-- Reversible: repoint the 3 preps back (GRILLED+SOUSVIDE -> KP-PRP-RCK,
-- MARINATED_FZ -> NULL) and deactivate/delete KP-PRP-SHR.

BEGIN;

-- 1. New L3 prep category "🦐 Shrimp" under KP-PRP (Prep Components).
INSERT INTO product_categories (id, code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'KP-PRP-SHR', '🦐 Shrimp', 'กุ้ง',
       (SELECT id FROM product_categories WHERE code = 'KP-PRP'),
       3,
       (SELECT COALESCE(MAX(sort_order), 0) + 1
          FROM product_categories
         WHERE parent_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP')),
       4150, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-PRP-SHR');

-- 2. Consolidate all shrimp semi-finished preps into KP-PRP-SHR.
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-SHR'),
       updated_at = now()
 WHERE product_code IN ('PF-SHRIMP_GRILLED', 'PF-SHRIMP_SOUSVIDE', 'PF-SHRIMP_MARINATED_FZ')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code = 'KP-PRP-SHR');

-- 3. Clean stale legacy text-category junk on the shrimp preps. `category_id` is the
--    authoritative field the /menu + kitchen chips read; the free-text `product_category`
--    column is unmaintained denorm and PF-SHRIMP_SOUSVIDE still carried a wrong "fish".
UPDATE nomenclature
   SET product_category = NULL, updated_at = now()
 WHERE product_code IN ('PF-SHRIMP_GRILLED', 'PF-SHRIMP_SOUSVIDE', 'PF-SHRIMP_MARINATED_FZ')
   AND product_category IS NOT NULL;

INSERT INTO migration_log (filename, status, notes)
VALUES (
  '340_shrimp_prep_category.sql',
  'success',
  'New KP-PRP-SHR "🦐 Shrimp" L3 prep category; moved PF-SHRIMP_GRILLED, PF-SHRIMP_SOUSVIDE (both from KP-PRP-RCK) and PF-SHRIMP_MARINATED_FZ (from NULL/Uncategorized) into it. Supersedes mig 301 note that kept grilled shrimp in Cooked Components. CEO 2026-07-01: cook-legible category names, group shrimp preps by protein. Raw shrimp ingredients (F-PRO-SEA) untouched.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
