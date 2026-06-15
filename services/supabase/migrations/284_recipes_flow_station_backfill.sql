-- 284_recipes_flow_station_backfill.sql
-- Seed recipes_flow.location_id so the L1 (Kitchen prep) vs L2 (Assembly/bar)
-- station split is backed by real data instead of the UI type+section fallback.
--
-- Model (CEO 2026-06-14): station lives on the recipe STEP. Phase 1 hid bar
-- drinks from the L1 Cook view via a fallback; this migration makes the split
-- real for the unambiguous cases and leaves the genuinely-mixed ones for cooks
-- to tag per-step in the recipe builder (Phase 2 editor).
--
-- Buckets:
--   * drinks (steps under the "Drinks" umbrella, section code KP-DRK) → Assembly (L2)
--   * PF prep batches (заготовки)                                     → Kitchen  (L1)
--   * SALE finished dishes                                            → left NULL (manual)
--
-- Idempotent: only rows with location_id IS NULL are touched; the 3 already
-- hand-tagged recipes are preserved. Safe to re-run.

BEGIN;

-- ── Drinks → Assembly (L2) ───────────────────────────────────────────────
-- Resolve each item's category up to its nearest is_menu_section ancestor and
-- match the Drinks umbrella (KP-DRK) — this catches juices too, which sit under
-- Drinks despite a KP-FIN-JCE leaf code.
WITH RECURSIVE walk AS (
  SELECT c.id AS cat_id, c.id AS node_id, c.code, c.parent_id, c.is_menu_section
  FROM product_categories c
  UNION ALL
  SELECT w.cat_id, p.id, p.code, p.parent_id, p.is_menu_section
  FROM walk w
  JOIN product_categories p ON p.id = w.parent_id
  WHERE NOT w.is_menu_section
),
drink_cats AS (
  SELECT DISTINCT cat_id FROM walk WHERE is_menu_section AND code = 'KP-DRK'
)
UPDATE recipes_flow rf
SET location_id = (SELECT id FROM locations WHERE type = 'assembly' LIMIT 1),
    updated_at = now()
FROM nomenclature n
JOIN drink_cats dc ON dc.cat_id = n.category_id
WHERE rf.nomenclature_id = n.id
  AND rf.location_id IS NULL;

-- ── PF prep batches → Kitchen (L1) ───────────────────────────────────────
UPDATE recipes_flow rf
SET location_id = (SELECT id FROM locations WHERE type = 'kitchen' LIMIT 1),
    updated_at = now()
FROM nomenclature n
WHERE rf.nomenclature_id = n.id
  AND rf.location_id IS NULL
  AND n.product_code LIKE 'PF-%';

-- SALE finished dishes intentionally left NULL — cooks tag prep (L1) vs
-- assembly (L2) per step in the recipe builder station selector.

INSERT INTO migration_log (filename) VALUES ('284_recipes_flow_station_backfill.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
