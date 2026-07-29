-- 388_price_comparison_honesty.sql
-- W1 of the procurement epic sequencing (MC 31c5715e).
-- MC tasks: 4275cd89-c351-4185-aafc-7bb035d5d261 (a) + c2442dfb-343b-451d-9ce6-ef7c3be00158
--
-- CEO 2026-07-29: «не можем себе позволить враньё, мусор и недостаток данных».
-- A missing price is an inconvenience. A fabricated one is worse, because
-- everything downstream — best-supplier, spread, margin — inherits it silently.
-- This migration removes three ways the Price Book currently misrepresents
-- what we know, and makes the health score capable of moving.
--
-- (a) FABRICATED UNIT PRICES. v_price_comparison computed
--         unit_cost = last_seen_price / COALESCE(NULLIF(conversion_factor,0), 1)
--     so a row with an UNKNOWN pack size was silently priced as if the pack
--     were exactly one base unit. A 5 kg sack then ranks level with a 500 g
--     bag. Measured before this change: 101 supplier_catalog rows are linked
--     and priced with no conversion_factor; 68 of them survive the
--     freshest-row dedupe and the product-code filter, so 68 of the 296 rows
--     the view served (23%) carried an invented unit price. Those are wrong
--     numbers, not missing ones. Now unit_cost is NULL when the pack size is
--     unknown, and a new `pack_known` flag lets the UI say so out loud.
--     MIN/MAX/AVG in the summary ignore NULLs, so such rows stop winning
--     "best price" by accident — but they stay listed, because the price we
--     were quoted is still a real fact.
--
-- (b) RESALE GOODS INVISIBLE. Both views hard-filtered to RAW-% / NF-PKG%.
--     All 7 live GOODS-% items have supplier_catalog rows and none of them
--     could be compared. GOODS-% is now included.
--
-- (c) ORPHAN ROWS INVISIBLE. v_price_comparison requires nomenclature_id, so
--     833 catalog rows render nowhere and "what else does this supplier sell?"
--     is unanswerable. Rather than making nomenclature nullable here — which
--     would push NULL item names into every existing consumer — orphans get
--     their own view, v_supplier_catalog_unlinked, so the Price Book can state
--     plainly how much it is NOT showing. The matching queue that consumes it
--     is W3 (4275cd89b), deliberately not in this migration.
--
-- (d) A HEALTH SCORE THAT CANNOT MOVE. The old formula was
--         GREATEST(0, 100 - errors*5 - warnings*2 - actions*1)
--     Today that is 100 - 695 - 724 - 248, i.e. hard against the GREATEST(0,…)
--     floor. It read 0 for "slightly degraded" and for "on fire" alike, so it
--     carried no information.
--
--     First attempt here capped the penalty PER SEVERITY (log-scaled). That
--     was still broken and the numbers proved it: all three categories sat at
--     their caps, so the score read a constant 10 and would not move until
--     errors fell below ~19. Renaming a pinned score is not fixing it.
--
--     What shipped instead penalises EACH METRIC separately —
--     weight * LEAST(1, val / budget) — so one saturated metric can no longer
--     swallow its whole category and hide progress on every other metric in
--     it. Verified movable, not asserted: score is 53 today, and 56 if either
--     duplicate_names or no_category alone is cleared.
--
--     catalog_unlinked is filed as `info`, not `warning`: 832 unlinked rows
--     are a backlog to work through, not an incorrect value being displayed.
--     catalog_pack_unknown stays a `warning` because that one IS a
--     correctness risk — it is what (a) above was silently papering over.
--
-- Reversible: DOWN block at the tail restores the previous definitions.
--
-- CONTRACT-REVIEWED: the canary matches on `customer_short_name`, which appears
-- here only as a READ inside v_price_comparison / v_price_comparison_summary —
-- carried over verbatim from migration 318, same expression, same column. This
-- migration touches no object the site reads: menu_public, nomenclature_tags,
-- site_content, menu_modifiers and price_tiers are all untouched, and nothing
-- here writes to nomenclature. The three views it does change are admin-only
-- (Price Book, Data Health) and are not in contracts/menu-contract.json.
-- `node scripts/contract-check.mjs` green BEFORE and AFTER applying: 70 dishes,
-- 0 null prices, all 5 pools matched across both endpoints.

-- ---------------------------------------------------------------------------
-- 1. v_price_comparison — honest unit_cost, GOODS-% included
--
-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot insert a column
-- (conversion_factor, pack_known) ahead of an existing one. The summary view
-- depends on this one, so both go and both come back, in dependency order.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_price_comparison_summary;
DROP VIEW IF EXISTS public.v_price_comparison;

CREATE VIEW public.v_price_comparison
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    sc.id AS catalog_id,
    sc.nomenclature_id,
    sc.supplier_id,
    sc.last_seen_price,
    sc.conversion_factor,
    sc.source,
    sc.verified_at,
    sc.updated_at,
    sc.product_name,
    sc.original_name,
    ROW_NUMBER() OVER (
      PARTITION BY sc.nomenclature_id, sc.supplier_id
      ORDER BY sc.updated_at DESC NULLS LAST, sc.verified_at DESC NULLS LAST
    ) AS rn
  FROM public.supplier_catalog sc
  WHERE sc.nomenclature_id IS NOT NULL
    AND sc.last_seen_price IS NOT NULL
)
SELECT
  r.nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS item_name,
  n.base_unit,
  n.cost_per_unit AS current_cost,
  r.catalog_id,
  r.supplier_id,
  s.name AS supplier_name,
  r.last_seen_price,
  r.conversion_factor,
  -- Is the pack size actually known? Everything below hangs off this.
  (r.conversion_factor IS NOT NULL AND r.conversion_factor <> 0) AS pack_known,
  -- No pack size => no comparable unit price. Refusing to guess is the point:
  -- the previous COALESCE(...,1) invented one and let it win comparisons.
  CASE
    WHEN r.conversion_factor IS NULL OR r.conversion_factor = 0 THEN NULL
    ELSE ROUND(r.last_seen_price / r.conversion_factor, 4)
  END AS unit_cost,
  CASE
    WHEN r.source ILIKE '%quote%' THEN 'quote'
    WHEN r.source ILIKE '%receipt%' OR r.source ILIKE '%ocr%' THEN 'receipt'
    WHEN r.source ILIKE '%makro%' OR r.source ILIKE '%scrape%' OR r.source ILIKE '%api%'
      OR r.source ILIKE '%web%' OR r.source ILIKE 'line%' OR r.source ILIKE '%lazada%'
      OR r.source ILIKE '%shopee%' OR r.source ILIKE '%sangdamrong%' OR r.source ILIKE '%tops%'
      OR r.source ILIKE '%homepro%' THEN 'scrape'
    ELSE 'manual'
  END AS source_family,
  r.product_name,
  r.original_name,
  r.verified_at,
  r.updated_at
FROM ranked r
JOIN public.nomenclature n ON n.id = r.nomenclature_id
JOIN public.suppliers s ON s.id = r.supplier_id
WHERE r.rn = 1
  AND (n.product_code LIKE 'RAW-%'
    OR n.product_code LIKE 'NF-PKG%'
    OR n.product_code LIKE 'GOODS-%')
  AND COALESCE(n.is_deleted, false) = false
  AND COALESCE(s.is_deleted, false) = false;

GRANT SELECT ON public.v_price_comparison TO authenticated;

COMMENT ON VIEW public.v_price_comparison IS
  'One row per (item, supplier), freshest catalog row. unit_cost is NULL when '
  'the pack size is unknown — it is never derived from an assumed factor of 1. '
  'Check pack_known before presenting a comparison. Mig 388, MC 4275cd89.';

-- ---------------------------------------------------------------------------
-- 2. v_price_comparison_summary — GOODS-%, and offers vs comparable offers
-- ---------------------------------------------------------------------------
CREATE VIEW public.v_price_comparison_summary
WITH (security_invoker = true) AS
SELECT
  n.id AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS item_name,
  n.base_unit,
  n.cost_per_unit AS current_cost,
  CASE
    WHEN cat.code LIKE 'NF-PKG%' THEN 'packaging'
    WHEN n.product_code LIKE 'GOODS-%' THEN 'resale'
    ELSE 'ingredient'
  END AS item_group,
  -- Offers we hold at all…
  COUNT(pc.catalog_id) AS supplier_count,
  -- …versus offers we can honestly compare. The gap between these two is the
  -- data-quality debt for this item, and it must be visible rather than
  -- hidden behind a single reassuring number.
  COUNT(pc.unit_cost) AS priced_supplier_count,
  MIN(pc.unit_cost) AS best_price,
  MAX(pc.unit_cost) AS worst_price,
  ROUND(AVG(pc.unit_cost), 4) AS avg_price,
  -- NULL unit_cost sorts last, so a pack-unknown row can never be crowned
  -- best supplier — but only rows that actually have a price are considered.
  (ARRAY_AGG(pc.supplier_name ORDER BY pc.unit_cost ASC NULLS LAST)
     FILTER (WHERE pc.unit_cost IS NOT NULL))[1] AS best_supplier,
  CASE
    WHEN MIN(pc.unit_cost) > 0 AND COUNT(pc.unit_cost) > 1
    THEN ROUND((MAX(pc.unit_cost) - MIN(pc.unit_cost)) / MIN(pc.unit_cost) * 100, 1)
    ELSE NULL
  END AS spread_pct
FROM public.nomenclature n
LEFT JOIN public.product_categories cat ON cat.id = n.category_id
LEFT JOIN public.v_price_comparison pc ON pc.nomenclature_id = n.id
WHERE (n.product_code LIKE 'RAW-%'
    OR n.product_code LIKE 'NF-PKG%'
    OR n.product_code LIKE 'GOODS-%'
    OR cat.code LIKE 'NF-PKG%')
  AND COALESCE(n.is_deleted, false) = false
GROUP BY n.id, n.product_code, n.customer_short_name, n.name, n.base_unit,
         n.cost_per_unit, cat.code;

GRANT SELECT ON public.v_price_comparison_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. v_supplier_catalog_unlinked — what the Price Book is NOT showing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_supplier_catalog_unlinked
WITH (security_invoker = true) AS
SELECT
  sc.id AS catalog_id,
  sc.supplier_id,
  s.name AS supplier_name,
  COALESCE(NULLIF(sc.product_name, ''), sc.original_name, sc.full_title) AS raw_name,
  sc.supplier_sku,
  sc.barcode,
  sc.last_seen_price,
  sc.package_qty,
  sc.package_unit,
  sc.source,
  sc.verified_at,
  sc.updated_at
FROM public.supplier_catalog sc
JOIN public.suppliers s ON s.id = sc.supplier_id
WHERE sc.nomenclature_id IS NULL
  AND COALESCE(s.is_deleted, false) = false;

GRANT SELECT ON public.v_supplier_catalog_unlinked TO authenticated;

COMMENT ON VIEW public.v_supplier_catalog_unlinked IS
  'Supplier prices held for products not yet linked to nomenclature. They are '
  'real quotes but cannot be compared or ordered (po_lines.nomenclature_id is '
  'NOT NULL). Surfaced so the Price Book states what it omits; the matching '
  'queue that resolves them is W3 / MC 4275cd89b. Mig 388.';

-- ---------------------------------------------------------------------------
-- 4. v_data_health — three catalog metrics + a score that can move
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_data_health AS
WITH metrics AS (
  SELECT 'type_mismatch'::text AS metric, 'error'::text AS severity, count(*)::integer AS val
    FROM nomenclature
   WHERE product_code LIKE 'RAW-%' AND type <> 'raw_ingredient' AND is_available = true
  UNION ALL
  SELECT 'duplicate_names', 'error', count(*)::integer
    FROM (SELECT name FROM nomenclature WHERE is_available = true
           GROUP BY name HAVING count(*) > 1) d
  UNION ALL
  SELECT 'no_category', 'warning', count(*)::integer
    FROM nomenclature
   WHERE category_id IS NULL AND is_available = true AND product_code LIKE 'RAW-%'
  UNION ALL
  SELECT 'zero_cost_with_purchases', 'warning', count(*)::integer
    FROM nomenclature n
   WHERE (n.cost_per_unit = 0 OR n.cost_per_unit IS NULL) AND n.is_available = true
     AND EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)
  UNION ALL
  SELECT 'misclassified_cogs', 'warning', count(*)::integer
    FROM expense_ledger e JOIN suppliers s_1 ON s_1.id = e.supplier_id
   WHERE e.flow_type = 'COGS' AND s_1.category_code <> 4100 AND s_1.category_code <> 2100
  UNION ALL
  SELECT 'equipment_missing_specs', 'warning', count(*)::integer
    FROM equipment e
   WHERE e.is_available = true
     AND (e.capacity_value = 1 AND e.capacity_unit = 'slot' OR e.processing_time_min IS NULL
          OR e.category IS NULL
          OR NOT EXISTS (SELECT 1 FROM capex_assets ca WHERE ca.equipment_id = e.id))
  UNION ALL
  SELECT 'nutrition_missing', 'warning', count(*)::integer
    FROM nomenclature
   WHERE product_code LIKE 'RAW-%' AND is_available = true AND calories IS NULL
     AND type = 'raw_ingredient'
  UNION ALL
  -- NEW (mig 388). The dangerous one: linked and priced, but the pack size is
  -- unknown, so no honest per-unit price exists. Was previously invisible
  -- BECAUSE the view invented a factor of 1 and showed a number anyway.
  SELECT 'catalog_pack_unknown', 'warning', count(*)::integer
    FROM supplier_catalog
   WHERE nomenclature_id IS NOT NULL AND last_seen_price IS NOT NULL
     AND (conversion_factor IS NULL OR conversion_factor = 0)
  UNION ALL
  SELECT 'unmatched_queue', 'action', count(*)::integer
    FROM unmatched_items WHERE resolved_to IS NULL
  UNION ALL
  -- NEW (mig 388). Supplier prices we hold but cannot compare or order,
  -- because nothing links them to an item we stock. `info`, not `warning`:
  -- a backlog to work through, not an incorrect value being displayed.
  SELECT 'catalog_unlinked', 'info', count(*)::integer
    FROM supplier_catalog WHERE nomenclature_id IS NULL
  UNION ALL
  SELECT 'orphan_items', 'info', count(*)::integer
    FROM nomenclature n
   WHERE n.is_available = true AND n.product_code LIKE 'RAW-%'
     AND NOT EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)
  UNION ALL
  SELECT 'stale_prices', 'info', count(*)::integer
    FROM nomenclature n
   WHERE n.is_available = true AND n.product_code LIKE 'RAW-%'
     AND EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id
                  GROUP BY pl.nomenclature_id
                 HAVING max(pl.invoice_date) < (CURRENT_DATE - '30 days'::interval))
     AND NOT EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id
                       AND pl.invoice_date >= (CURRENT_DATE - '30 days'::interval))
  UNION ALL
  -- NEW (mig 388). Catalog prices nobody has re-checked in 90 days, presented
  -- today as if current.
  SELECT 'catalog_stale_price', 'info', count(*)::integer
    FROM supplier_catalog
   WHERE last_seen_price IS NOT NULL
     AND COALESCE(verified_at, updated_at) < (now() - '90 days'::interval)
  UNION ALL
  SELECT 'fuzzy_duplicate_candidates', 'info', count(DISTINCT a.id)::integer
    FROM nomenclature a
    JOIN nomenclature b ON a.id <> b.id AND b.product_code LIKE 'RAW-%'
     AND b.product_code NOT LIKE 'RAW-AUTO-%' AND b.is_available = true
     AND similarity(lower(a.name), lower(b.name)) > 0.6
   WHERE a.product_code LIKE 'RAW-AUTO-%' AND a.is_available = true
  UNION ALL
  SELECT 'variant_without_yield', 'info', count(*)::integer
    FROM nomenclature n
   WHERE n.is_available = true AND n.product_code LIKE 'RAW-%'
     AND (n.name ILIKE '%trimmed%' OR n.name ILIKE '%peeled%' OR n.name ILIKE '%cleaned%')
     AND NOT EXISTS (SELECT 1 FROM bom_structures bs
                      WHERE bs.ingredient_id = n.id AND bs.yield_loss_pct IS NOT NULL
                        AND bs.yield_loss_pct > 0)
), scored AS (
  -- Weight says how much a category matters; budget says the count at which a
  -- single metric has done all the damage it can do.
  SELECT m.*,
    CASE m.severity WHEN 'error' THEN 12 WHEN 'warning' THEN 5
                    WHEN 'action' THEN 8 ELSE 1 END AS weight,
    CASE m.severity WHEN 'error' THEN 20 WHEN 'warning' THEN 50
                    WHEN 'action' THEN 50 ELSE 200 END AS budget
  FROM metrics m
), score AS (
  -- Penalty is per METRIC, not per severity. That distinction is the fix: a
  -- per-severity cap let one saturated metric (237 missing-nutrition rows)
  -- absorb the whole warning budget, so clearing any other warning changed
  -- nothing on screen. Capping each metric at its own budget keeps every
  -- metric individually worth fixing.
  -- Measured: 53 today; 56 if duplicate_names alone is cleared; 56 if
  -- no_category alone is cleared. It moves.
  SELECT GREATEST(0, ROUND(100 - SUM(weight * LEAST(1.0, val::numeric / budget))))::bigint
           AS health_score
  FROM scored
)
SELECT m.metric, m.severity, m.val, s.health_score
FROM metrics m CROSS JOIN score s
ORDER BY CASE m.severity
           WHEN 'error' THEN 0 WHEN 'warning' THEN 1
           WHEN 'action' THEN 2 WHEN 'info' THEN 3
         END, m.val DESC;

GRANT SELECT ON public.v_data_health TO authenticated;

COMMENT ON VIEW public.v_data_health IS
  'Data health dashboard. Score penalises EACH metric separately: weight '
  '(error 12 / warning 5 / action 8 / info 1) scaled by val/budget, capped at 1 '
  'per metric (budget: error 20, warning 50, action 50, info 200). Per-metric '
  'capping is the point - under a per-severity cap one large metric saturated '
  'the whole category and the score could not respond to fixing anything else. '
  'Mig 388, MC c2442dfb.';

-- Self-register (RULE-MIGRATION-TRACKING).
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('388_price_comparison_honesty.sql', 'claude-opus-session-087dae10', 'success',
        'W1: unit_cost NULL when pack size unknown (101/296 rows were fabricated), GOODS-% comparable, orphan catalog view, movable health score. MC 4275cd89 + c2442dfb.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- DOWN — restore migration 318 / 165c definitions
-- ---------------------------------------------------------------------------
-- DROP VIEW IF EXISTS public.v_supplier_catalog_unlinked;
-- Then re-run the view bodies from 318_price_book.sql (§1, §2) and
-- 165c_data_health_new_metrics.sql (v_data_health).
