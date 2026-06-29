-- 334 — Pantry-label tag for the "Jars & Bottles" kitchen-label tab
--
-- The kitchen label station (/kitchen/labels) prints storage labels for PF preps
-- and SALE dishes. The CEO also needs decant/open labels (name + opened-on +
-- use-by + QR) for shelf-stable pantry staples stored in jars & bottles —
-- oils, vinegars, spices, seeds, sauces, pastes, sweeteners, salt, flours, nuts,
-- legumes, dry goods, etc.
--
-- Rather than show every RAW item (304 active — most are fresh produce, dairy,
-- meat, packaging that never get a jar label) the tab filters by a curated,
-- data-driven tag. This migration seeds that tag so the CEO can extend/trim the
-- set later from the data (add/remove the tag on a nomenclature row).
--
-- Curation logic (reviewed against the live catalog):
--   * INCLUDE all active, non-deleted RAW items in pantry/shelf-stable categories
--     (oils, vinegars, sauces, pastes, spices, seeds, sweeteners, salt, baking,
--      flours, nuts, legumes, starches, dry/jarred goods, coffee, dressings).
--   * EXCLUDE fresh produce mis-filed under spice categories (garlic, ginger).
--   * ADD a handful of pantry items mis-categorised under Fresh Herbs / Vegetables
--     (dried herbs, ground spices, jarred pastes, canned chipotle) + rice vinegar.
--   * RESTORE soft-deleted RAW-BAKING-SODA — the CEO actively stocks it and asked
--     to print its label, and there is no other canonical baking soda row.
--
-- Idempotent: re-running is a no-op (guards + ON CONFLICT DO NOTHING).

BEGIN;

-- 1) The operational tag (group 'ops'). Created only if missing — no dependency
--    on a UNIQUE constraint so it is safe regardless of the tags index set.
INSERT INTO tags (slug, name, name_th, tag_group, color, sort_order)
SELECT 'pantry-label', 'Pantry Label', 'ป้ายคลัง', 'ops'::tag_group, '#0EA5E9', 10
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE slug = 'pantry-label');

-- 2) Restore baking soda (CEO stocks it; was soft-deleted with no canonical
--    replacement). Done before tagging so the targets CTE below picks it up.
UPDATE nomenclature
SET is_deleted = FALSE, is_available = TRUE
WHERE product_code = 'RAW-BAKING-SODA' AND is_deleted IS TRUE;

-- 3) Tag the curated pantry set.
WITH pantry_tag AS (
  SELECT id FROM tags WHERE slug = 'pantry-label'
),
targets AS (
  SELECT n.id
  FROM nomenclature n
  JOIN product_categories pc ON pc.id = n.category_id
  WHERE n.product_code LIKE 'RAW-%'
    AND n.is_deleted IS NOT TRUE
    AND (
      pc.name IN (
        'Cooking Oils','Vinegar & Acids','Base Sauces','Pastes','Purees & Pastes',
        'Soy-based','Seeds','Sweeteners','Salt','Baking Agents','Chili & Hot Sauces',
        'Dressings','Dry Spices & Herbs','Flours','Starches & Thickeners','Legumes',
        'Tree Nuts','Superfoods','Nut Butters','Coffee & Cacao','Canned Goods',
        'Pickled','Tea & Herbal','Rice & Pseudocereals'
      )
      OR n.product_code IN (
        -- pantry items mis-categorised under Fresh Herbs / Vegetables, + baking soda
        'RAW-DRIED_PARSLEY','RAW-MINT_DRIED','RAW-GALANGAL','RAW-BAY-LEAVES','RAW-THYME',
        'RAW-SYRUP_GREEN_MINT','RAW-PEPPER_WHITE','RAW-LONG-PEPPER','RAW-PEPPER_PASTE_RED',
        'RAW-CHIPOTLE_ADOBO','RAW-BAKING-SODA'
      )
    )
    -- fresh produce mis-filed under spice categories
    AND n.product_code NOT IN ('RAW-GARLIC','RAW-GINGER')
)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT t.id, pt.id
FROM targets t CROSS JOIN pantry_tag pt
ON CONFLICT (nomenclature_id, tag_id) DO NOTHING;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM nomenclature_tags nt
  JOIN tags t ON t.id = nt.tag_id
  WHERE t.slug = 'pantry-label';
  IF v_count < 50 THEN
    RAISE EXCEPTION '334 ABORT: expected >=50 pantry-label items, found %', v_count;
  END IF;
  RAISE NOTICE '334 OK: % nomenclature rows tagged pantry-label', v_count;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '334_pantry_label_tag.sql',
  'claude-code',
  NULL,
  'Seed ops tag pantry-label for the /kitchen/labels "Jars & Bottles" tab. Curated RAW pantry set (category allowlist - {garlic,ginger} + mis-categorised dried herbs/ground spices/jarred pastes/chipotle/rice vinegar). Restored soft-deleted RAW-BAKING-SODA. Idempotent.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- DOWN (manual):
--   DELETE FROM nomenclature_tags WHERE tag_id = (SELECT id FROM tags WHERE slug='pantry-label');
--   DELETE FROM tags WHERE slug = 'pantry-label';
--   -- (RAW-BAKING-SODA stays restored; re-soft-delete only if it was truly retired)
