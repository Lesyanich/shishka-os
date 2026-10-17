-- =============================================================================
-- 466b_analytics_views_s1.sql
-- S1 of docs/plans/spec-stock-control-analytics.md (MC 1be5f592)
--
-- Creates the 14 v_analytics_* read-only views (spec section 4), populates
-- nomenclature.count_class from rolling 8-week purchase THB (spec section 3.3)
-- and implements the PF -> RAW explosion for theoretical usage (spec 3.6).
--
-- Invariants held throughout:
--   * plain views, security_invoker = true  -> caller's RLS applies, no new exposure
--   * no new tables, no changes to existing views / RPCs / functions
--   * zero DML on prices or costs; the only write is nomenclature.count_class
--   * ISO weeks bucketed in Asia/Bangkok, never UTC
--   * refund-aware: receipt_type = 'REFUND' excluded from sales, reported apart
--   * canonical item = product_code NOT LIKE 'RAW-AUTO-%' AND NOT is_deleted
--
-- Measured conventions (prod 2026-10-16) that the SQL below depends on:
--   * orders.receipt_type: SALE 501 / REFUND 2 / NULL 1. Sales use
--     "IS DISTINCT FROM 'REFUND'" so the single NULL row is kept, not dropped.
--     Sept 2026 then reproduces exactly 177 receipts / THB 52,946.
--   * stock_movements.qty_delta is always < 0 for loyverse_sale and > 0 for
--     loyverse_refund, so net usage = SUM(-qty_delta) over both reasons: a sale
--     adds usage, a refund removes it.
--   * purchase_logs.sku_id joins supplier_catalog.sku_id (NOT .id, which yields
--     zero rows) and the join FANS OUT (391 rows out of 361). Every
--     conversion_factor lookup therefore goes through a de-duplicated CTE.
--   * BOM depth from a PF node downward is at most 3 and depth 3 holds no PF
--     nodes, so the spec's depth <= 3 cap cuts nothing off. It stays as a
--     cycle guard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. v_analytics_sales_daily  -- grain: day
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_sales_daily
WITH (security_invoker = true) AS
WITH o AS (
  SELECT
    (COALESCE(ord.loyverse_created_at, ord.created_at) AT TIME ZONE 'Asia/Bangkok') AS ts_local,
    ord.receipt_type,
    ord.total_amount,
    ord.total_discount,
    ord.total_tax,
    ord.tip,
    ord.payment_type,
    ord.dining_option
  FROM orders ord
  WHERE ord.cancelled_at IS NULL
)
SELECT
  o.ts_local::date                                    AS day,
  date_trunc('week', o.ts_local)::date                AS week,
  count(*) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND')                         AS receipts,
  COALESCE(sum(o.total_amount)   FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0) AS gross_revenue,
  COALESCE(sum(abs(o.total_amount)) FILTER (WHERE o.receipt_type = 'REFUND'), 0)           AS refunds_thb,
  count(*) FILTER (WHERE o.receipt_type = 'REFUND')                                        AS refund_receipts,
  COALESCE(sum(o.total_amount)   FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0)
    - COALESCE(sum(abs(o.total_amount)) FILTER (WHERE o.receipt_type = 'REFUND'), 0)       AS net_revenue,
  COALESCE(sum(o.total_discount) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0) AS discounts_thb,
  COALESCE(sum(o.total_tax)      FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0) AS tax_thb,
  COALESCE(sum(o.tip)            FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0) AS tips_thb,
  round(
    COALESCE(sum(o.total_amount) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0)
    / NULLIF(count(*) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'), 0)
  , 2)                                                                                     AS avg_check,
  COALESCE(sum(o.total_amount) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND' AND o.payment_type = 'CASH'), 0)               AS cash_thb,
  COALESCE(sum(o.total_amount) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND' AND o.payment_type = 'NONINTEGRATEDCARD'), 0)  AS card_thb,
  COALESCE(sum(o.total_amount) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND'
            AND (o.payment_type IS NULL OR o.payment_type NOT IN ('CASH','NONINTEGRATEDCARD'))), 0)                                  AS other_payment_thb,
  count(*) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND' AND o.dining_option = 'Dine in')                                   AS dine_in_receipts,
  count(*) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND' AND o.dining_option IN ('Takeout','Delivery'))                     AS takeaway_receipts,
  COALESCE(sum(o.total_amount) FILTER (WHERE o.receipt_type IS DISTINCT FROM 'REFUND' AND o.dining_option IN ('Takeout','Delivery')), 0) AS takeaway_thb
FROM o
GROUP BY 1, 2;

COMMENT ON VIEW v_analytics_sales_daily IS
  'S1 analytics: daily sales. Gross/receipts exclude receipt_type=REFUND; refunds reported separately and netted in net_revenue. Bucketed on loyverse_created_at in Asia/Bangkok. Spec: docs/plans/spec-stock-control-analytics.md section 4.';

-- -----------------------------------------------------------------------------
-- 2. v_analytics_item_sales_daily  -- grain: day x item (is_modifier separates
--    modifier lines from dish lines so they are never summed together)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_item_sales_daily
WITH (security_invoker = true) AS
SELECT
  (COALESCE(o.loyverse_created_at, o.created_at) AT TIME ZONE 'Asia/Bangkok')::date         AS day,
  date_trunc('week', COALESCE(o.loyverse_created_at, o.created_at) AT TIME ZONE 'Asia/Bangkok')::date AS week,
  oi.nomenclature_id,
  n.product_code,
  n.name                                             AS item_name,
  (oi.parent_item_id IS NOT NULL)                    AS is_modifier,
  n.category_id,
  pc.code                                            AS category_code,
  pc.name                                            AS category_name,
  sum(oi.quantity)                                   AS units,
  COALESCE(sum(oi.quantity * oi.price_at_purchase), 0) AS revenue
FROM order_items oi
JOIN orders o           ON o.id = oi.order_id
JOIN nomenclature n     ON n.id = oi.nomenclature_id
LEFT JOIN product_categories pc ON pc.id = n.category_id
WHERE o.cancelled_at IS NULL
  AND o.receipt_type IS DISTINCT FROM 'REFUND'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9;

COMMENT ON VIEW v_analytics_item_sales_daily IS
  'S1 analytics: units and revenue per item per day. is_modifier=true rows are POS modifier lines (order_items.parent_item_id set) - never sum them with dish lines.';

-- -----------------------------------------------------------------------------
-- 3. v_analytics_hourly_heat  -- grain: day-of-week x hour
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_hourly_heat
WITH (security_invoker = true) AS
WITH o AS (
  SELECT (COALESCE(ord.loyverse_created_at, ord.created_at) AT TIME ZONE 'Asia/Bangkok') AS ts_local,
         ord.total_amount
  FROM orders ord
  WHERE ord.cancelled_at IS NULL
    AND ord.receipt_type IS DISTINCT FROM 'REFUND'
)
SELECT
  EXTRACT(ISODOW FROM o.ts_local)::int   AS iso_dow,          -- 1 = Monday .. 7 = Sunday
  to_char(o.ts_local, 'Dy')              AS dow_label,
  EXTRACT(HOUR FROM o.ts_local)::int     AS hour_local,
  count(*)                               AS receipts,
  COALESCE(sum(o.total_amount), 0)       AS revenue,
  min(o.ts_local)::date                  AS first_day,
  max(o.ts_local)::date                  AS last_day
FROM o
GROUP BY 1, 2, 3;

COMMENT ON VIEW v_analytics_hourly_heat IS
  'S1 analytics: receipts per ISO day-of-week x local hour (Asia/Bangkok). Spec plots receipts, not revenue - more stable at ~40 receipts/week.';

-- -----------------------------------------------------------------------------
-- 4. v_analytics_abc_items  -- grain: item
--    ABC is ranked over CANONICAL items only (spec 0.3: "per canonical item").
--    Stub rows are still listed, with count_class NULL, so the dashboard can
--    show how much spend is unclassifiable until MC 00a81c22 backfills them.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_abc_items
WITH (security_invoker = true) AS
WITH spend AS (
  SELECT
    pl.nomenclature_id,
    sum(pl.total_price)       AS purchase_thb_8w,
    count(*)                  AS lines_8w,
    max(pl.invoice_date)      AS last_invoice_date
  FROM purchase_logs pl
  WHERE pl.invoice_date >= (CURRENT_DATE - INTERVAL '8 weeks')::date
  GROUP BY 1
  HAVING sum(pl.total_price) > 0
),
flagged AS (
  SELECT
    s.*,
    n.product_code,
    n.name,
    n.base_unit,
    n.type,
    n.cost_per_unit,
    (n.product_code NOT LIKE 'RAW-AUTO-%' AND NOT COALESCE(n.is_deleted, false)) AS is_canonical
  FROM spend s
  JOIN nomenclature n ON n.id = s.nomenclature_id
),
ranked AS (
  SELECT
    f.*,
    sum(f.purchase_thb_8w) OVER (ORDER BY f.purchase_thb_8w DESC, f.nomenclature_id)
      / NULLIF(sum(f.purchase_thb_8w) OVER (), 0) AS cum_share
  FROM flagged f
  WHERE f.is_canonical
)
SELECT
  f.nomenclature_id,
  f.product_code,
  f.name,
  f.base_unit,
  f.type,
  f.is_canonical,
  round(f.purchase_thb_8w, 2)  AS purchase_thb_8w,
  f.lines_8w,
  f.last_invoice_date,
  round(r.cum_share, 6)        AS cum_share,
  CASE
    WHEN r.cum_share IS NULL     THEN NULL          -- stub: not classifiable
    WHEN r.cum_share <= 0.80     THEN 'A'
    WHEN r.cum_share <= 0.95     THEN 'B'
    ELSE 'C'
  END                          AS count_class
FROM flagged f
LEFT JOIN ranked r ON r.nomenclature_id = f.nomenclature_id;

COMMENT ON VIEW v_analytics_abc_items IS
  'S1 analytics: rolling 8-week purchase THB per item with cumulative-share ABC (A<=80%, B<=95%, C rest). Ranked over canonical items only; RAW-AUTO stubs appear with count_class NULL. Source of the nomenclature.count_class UPDATE.';

-- -----------------------------------------------------------------------------
-- 5. v_analytics_purchases_weekly  -- grain: week x item x supplier
--    Single place where conversion_factor -> qty_base is resolved.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_purchases_weekly
WITH (security_invoker = true) AS
WITH cf_by_sku AS (                     -- de-duplicated: sku_id is NOT unique
  SELECT sku_id, conversion_factor
  FROM (
    SELECT sc.sku_id, sc.conversion_factor,
           row_number() OVER (PARTITION BY sc.sku_id
                              ORDER BY sc.updated_at DESC NULLS LAST,
                                       sc.verified_at DESC NULLS LAST, sc.id) AS rn
    FROM supplier_catalog sc
    WHERE sc.sku_id IS NOT NULL AND sc.conversion_factor IS NOT NULL AND sc.conversion_factor <> 0
  ) q WHERE rn = 1
),
cf_by_item AS (                         -- fallback for lines with no sku_id
  SELECT supplier_id, nomenclature_id, conversion_factor
  FROM (
    SELECT sc.supplier_id, sc.nomenclature_id, sc.conversion_factor,
           row_number() OVER (PARTITION BY sc.supplier_id, sc.nomenclature_id
                              ORDER BY sc.updated_at DESC NULLS LAST,
                                       sc.verified_at DESC NULLS LAST, sc.id) AS rn
    FROM supplier_catalog sc
    WHERE sc.nomenclature_id IS NOT NULL AND sc.supplier_id IS NOT NULL
      AND sc.conversion_factor IS NOT NULL AND sc.conversion_factor <> 0
  ) q WHERE rn = 1
),
lines AS (
  SELECT
    date_trunc('week', pl.invoice_date::timestamp)::date AS week,
    pl.nomenclature_id,
    pl.supplier_id,
    pl.quantity,
    pl.total_price,
    pl.price_per_unit,
    pl.invoice_date,
    pl.created_at,
    COALESCE(cs.conversion_factor, ci.conversion_factor, 1) AS cf
  FROM purchase_logs pl
  LEFT JOIN cf_by_sku  cs ON cs.sku_id = pl.sku_id
  LEFT JOIN cf_by_item ci ON ci.supplier_id = pl.supplier_id
                         AND ci.nomenclature_id = pl.nomenclature_id
)
SELECT
  l.week,
  l.nomenclature_id,
  n.product_code,
  n.name                AS item_name,
  n.base_unit,
  l.supplier_id,
  s.name                AS supplier_name,
  count(*)              AS lines,
  round(sum(l.quantity * l.cf), 6)                                 AS qty_base,
  round(sum(l.total_price), 2)                                     AS thb,
  (array_agg(l.price_per_unit ORDER BY l.invoice_date DESC, l.created_at DESC))[1] AS last_price_per_unit,
  round(
    (array_agg(l.total_price ORDER BY l.invoice_date DESC, l.created_at DESC))[1]
    / NULLIF((array_agg(l.quantity * l.cf ORDER BY l.invoice_date DESC, l.created_at DESC))[1], 0)
  , 6)                                                             AS last_unit_price_base,
  max(l.invoice_date)                                              AS last_invoice_date,
  bool_or(l.cf IS DISTINCT FROM 1)                                 AS cf_known,
  (n.product_code NOT LIKE 'RAW-AUTO-%' AND NOT COALESCE(n.is_deleted, false)) AS is_canonical
FROM lines l
JOIN nomenclature n ON n.id = l.nomenclature_id
LEFT JOIN suppliers s ON s.id = l.supplier_id
GROUP BY l.week, l.nomenclature_id, n.product_code, n.name, n.base_unit,
         l.supplier_id, s.name, n.is_deleted;

COMMENT ON VIEW v_analytics_purchases_weekly IS
  'S1 analytics: weekly purchases per item per supplier. qty_base = quantity * COALESCE(conversion_factor,1); the factor comes from a de-duplicated supplier_catalog CTE (purchase_logs.sku_id -> supplier_catalog.sku_id fans out 391/361, a naive join inflates THB ~8%). cf_known=false means the quantity is in purchase units, not base units.';

-- -----------------------------------------------------------------------------
-- 6. v_analytics_purchase_coverage_weekly  -- grain: week
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_purchase_coverage_weekly
WITH (security_invoker = true) AS
WITH pur AS (
  SELECT
    date_trunc('week', pl.invoice_date::timestamp)::date AS week,
    pl.total_price,
    (n.product_code NOT LIKE 'RAW-AUTO-%' AND NOT COALESCE(n.is_deleted, false)) AS is_canonical
  FROM purchase_logs pl
  JOIN nomenclature n ON n.id = pl.nomenclature_id
),
agg AS (
  SELECT
    week,
    count(*)                                                        AS lines_total,
    count(*) FILTER (WHERE is_canonical)                            AS canonical_lines,
    count(*) FILTER (WHERE NOT is_canonical)                        AS stub_lines,
    COALESCE(sum(total_price), 0)                                   AS thb_total,
    COALESCE(sum(total_price) FILTER (WHERE is_canonical), 0)       AS thb_canonical
  FROM pur GROUP BY 1
),
unm AS (
  SELECT date_trunc('week', ui.created_at AT TIME ZONE 'Asia/Bangkok')::date AS week,
         count(*) AS unmatched_open
  FROM unmatched_items ui
  WHERE ui.resolved_to IS NULL
  GROUP BY 1
)
SELECT
  a.week,
  a.lines_total,
  a.canonical_lines,
  a.stub_lines,
  round(a.thb_total, 2)                                            AS thb_total,
  round(a.thb_canonical, 2)                                        AS thb_canonical,
  round(100.0 * a.thb_canonical / NULLIF(a.thb_total, 0), 2)       AS canonical_pct,
  round(100.0 * a.canonical_lines / NULLIF(a.lines_total, 0), 2)   AS canonical_lines_pct,
  COALESCE(u.unmatched_open, 0)                                    AS unmatched_open
FROM agg a
LEFT JOIN unm u ON u.week = a.week;

COMMENT ON VIEW v_analytics_purchase_coverage_weekly IS
  'S1 analytics: how much of each week purchased THB lands on canonical items. canonical_pct is by THB (the spec target); canonical_lines_pct is by line count. unmatched_open counts still-unresolved unmatched_items created that week. Phase 0.1 gate: canonical_pct >= 90% for 2 consecutive weeks.';

-- -----------------------------------------------------------------------------
-- 7. v_analytics_price_watch  -- grain: item
--    Built on v_analytics_purchases_weekly so conversion_factor logic lives in
--    exactly one place.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_price_watch
WITH (security_invoker = true) AS
WITH w AS (
  SELECT *
  FROM v_analytics_purchases_weekly p
  WHERE p.is_canonical
    AND p.week >= (date_trunc('week', CURRENT_DATE::timestamp) - INTERVAL '8 weeks')::date
    AND p.last_unit_price_base IS NOT NULL
    AND p.last_unit_price_base > 0
),
stats AS (
  SELECT
    nomenclature_id,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY last_unit_price_base)::numeric AS median_unit_price_8w,
    count(*) AS weeks_observed
  FROM w GROUP BY 1
),
latest AS (
  SELECT DISTINCT ON (nomenclature_id)
    nomenclature_id, product_code, item_name, base_unit,
    supplier_id, supplier_name, last_unit_price_base, last_invoice_date, cf_known
  FROM w
  ORDER BY nomenclature_id, last_invoice_date DESC, week DESC
)
SELECT
  l.nomenclature_id,
  l.product_code,
  l.item_name,
  l.base_unit,
  l.supplier_id,
  l.supplier_name,
  round(l.last_unit_price_base, 4)        AS last_unit_price,
  round(s.median_unit_price_8w, 4)        AS median_unit_price_8w,
  l.last_invoice_date,
  s.weeks_observed,
  l.cf_known,
  n.count_class,
  round(100.0 * (l.last_unit_price_base - s.median_unit_price_8w)
        / NULLIF(s.median_unit_price_8w, 0), 2) AS delta_pct,
  (s.weeks_observed >= 2
   AND 100.0 * (l.last_unit_price_base - s.median_unit_price_8w)
       / NULLIF(s.median_unit_price_8w, 0) > 10) AS is_spike
FROM latest l
JOIN stats s        ON s.nomenclature_id = l.nomenclature_id
JOIN nomenclature n ON n.id = l.nomenclature_id;

COMMENT ON VIEW v_analytics_price_watch IS
  'S1 analytics: last purchase unit price (per base unit) vs the 8-week median per canonical item. is_spike = delta > +10% and at least 2 observed weeks. cf_known=false means the unit price is per purchase unit, so treat the delta with care.';

-- -----------------------------------------------------------------------------
-- 8. v_analytics_usage_weekly  -- grain: week x item
--    Theoretical usage: direct deductions as-is, plus PF deductions exploded to
--    their leaves through bom_structures (recursive, depth <= 3, yield_loss_pct
--    applied at every level).
--    NOTE: the pf_explosion / mv CTEs are duplicated in
--    v_analytics_stock_variance, which needs the same logic at DAILY grain to
--    slice arbitrary count-to-count intervals. Two occurrences only - keep them
--    in sync; factor out only if a third consumer appears.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_usage_weekly
WITH (security_invoker = true) AS
WITH RECURSIVE pf_explosion AS (
  SELECT
    b.parent_id                                                          AS pf_id,
    b.ingredient_id,
    (b.quantity_per_unit * (1 + COALESCE(b.yield_loss_pct, 0) / 100.0))::numeric AS qty_per_pf,
    1                                                                    AS depth
  FROM bom_structures b
  JOIN nomenclature p ON p.id = b.parent_id AND p.product_code LIKE 'PF-%'
  UNION ALL
  SELECT
    e.pf_id,
    b.ingredient_id,
    (e.qty_per_pf * b.quantity_per_unit * (1 + COALESCE(b.yield_loss_pct, 0) / 100.0))::numeric,
    e.depth + 1
  FROM pf_explosion e
  JOIN bom_structures b ON b.parent_id = e.ingredient_id
  WHERE e.depth < 3
),
pf_to_leaf AS (
  -- sum over ALL paths: one leaf can be reached at several depths
  -- (e.g. olive oil sits in the manakish PF directly and inside its dough PF)
  SELECT e.pf_id, e.ingredient_id AS leaf_id, sum(e.qty_per_pf) AS qty_per_pf
  FROM pf_explosion e
  JOIN nomenclature ln ON ln.id = e.ingredient_id
  WHERE ln.product_code NOT LIKE 'PF-%'
  GROUP BY 1, 2
),
mv AS (
  SELECT
    sm.nomenclature_id AS item_id,
    date_trunc('week', sm.created_at AT TIME ZONE 'Asia/Bangkok')::date AS week,
    sum(-sm.qty_delta) AS qty      -- sale: -(neg) = +usage ; refund: -(pos) = -usage
  FROM stock_movements sm
  WHERE sm.reason IN ('loyverse_sale', 'loyverse_refund')
  GROUP BY 1, 2
),
combined AS (
  SELECT m.week, m.item_id, m.qty AS direct_qty, 0::numeric AS exploded_qty
  FROM mv m
  UNION ALL
  SELECT m.week, t.leaf_id, 0::numeric, sum(m.qty * t.qty_per_pf)
  FROM mv m
  JOIN nomenclature p ON p.id = m.item_id AND p.product_code LIKE 'PF-%'
  JOIN pf_to_leaf t   ON t.pf_id = m.item_id
  GROUP BY m.week, t.leaf_id
)
SELECT
  c.week,
  c.item_id                        AS nomenclature_id,
  n.product_code,
  n.name                           AS item_name,
  n.base_unit,
  CASE
    WHEN n.product_code LIKE 'PF-%'  THEN 'PF'
    WHEN n.product_code LIKE 'RAW-%' THEN 'RAW'
    ELSE 'OTHER'
  END                              AS tier,
  round(sum(c.direct_qty), 6)                          AS usage_direct_qty,
  round(sum(c.exploded_qty), 6)                        AS usage_exploded_qty,
  round(sum(c.direct_qty + c.exploded_qty), 6)         AS usage_qty,
  round(sum(c.direct_qty + c.exploded_qty) * COALESCE(n.cost_per_unit, 0), 4) AS usage_thb,
  n.count_class,
  (n.product_code NOT LIKE 'RAW-AUTO-%' AND NOT COALESCE(n.is_deleted, false)) AS is_canonical
FROM combined c
JOIN nomenclature n ON n.id = c.item_id
GROUP BY c.week, c.item_id, n.product_code, n.name, n.base_unit,
         n.cost_per_unit, n.count_class, n.is_deleted;

COMMENT ON VIEW v_analytics_usage_weekly IS
  'S1 analytics: theoretical weekly usage. usage_direct_qty = sale/refund deductions as booked; usage_exploded_qty = RAW derived from PF deductions via bom_structures (depth<=3, yield_loss_pct applied, summed over all paths). WARNING: PF rows and the RAW rows exploded from them both appear - group by tier, never sum PF and RAW usage_thb together. Soft-deleted RAW still in an active BOM is included on purpose (is_canonical=false) so usage is not silently under-counted.';

-- -----------------------------------------------------------------------------
-- 9. v_analytics_bom_coverage_weekly  -- grain: week
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_bom_coverage_weekly
WITH (security_invoker = true) AS
WITH li AS (
  SELECT
    date_trunc('week', COALESCE(o.loyverse_created_at, o.created_at) AT TIME ZONE 'Asia/Bangkok')::date AS week,
    oi.id          AS order_item_id,
    oi.nomenclature_id,
    n.product_code,
    oi.quantity,
    EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.order_item_id = oi.id) AS has_deduction
  FROM order_items oi
  JOIN orders o       ON o.id = oi.order_id
  JOIN nomenclature n ON n.id = oi.nomenclature_id
  WHERE o.cancelled_at IS NULL
    AND o.receipt_type IS DISTINCT FROM 'REFUND'
),
per_item AS (
  SELECT week, nomenclature_id, product_code,
         sum(quantity)                                     AS units,
         bool_or(has_deduction)                            AS any_deduction
  FROM li GROUP BY 1, 2, 3
)
SELECT
  l.week,
  sum(l.quantity)                                          AS units_sold,
  sum(l.quantity) FILTER (WHERE l.has_deduction)           AS units_deducted,
  round(100.0 * sum(l.quantity) FILTER (WHERE l.has_deduction)
        / NULLIF(sum(l.quantity), 0), 2)                   AS deducted_units_pct,
  count(DISTINCT l.nomenclature_id)                        AS items_sold,
  (SELECT count(*) FROM per_item pi WHERE pi.week = l.week AND NOT pi.any_deduction) AS items_without_deduction,
  (SELECT array_agg(pi.product_code ORDER BY pi.units DESC)
     FROM per_item pi WHERE pi.week = l.week AND NOT pi.any_deduction)               AS offending_items
FROM li l
GROUP BY l.week;

COMMENT ON VIEW v_analytics_bom_coverage_weekly IS
  'S1 analytics: share of sold units that produced at least one stock_movements row. offending_items lists product_codes that sold that week with no deduction at all. Phase 0.5 gate: deducted_units_pct >= 95%.';

-- -----------------------------------------------------------------------------
-- 10. v_analytics_count_days  -- grain: count_day x item
--     is_complete: there is no reliable "which stations stock item X" source
--     (stock_movements.location_id is NULL on every row, inventory_batches is
--     not fed by purchases), so the expected location set is the item's own
--     historical count footprint - every location where it has ever been
--     counted. CEO-approved 2026-10-16.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_count_days
WITH (security_invoker = true) AS
WITH e AS (
  SELECT
    (ste.created_at AT TIME ZONE 'Asia/Bangkok')::date AS count_day,
    ste.nomenclature_id,
    ste.location_id,
    sts.station_id,
    ste.counted_qty
  FROM stocktake_entries ste
  JOIN stocktake_sessions sts ON sts.id = ste.session_id
  WHERE ste.status = 'confirmed'
    AND sts.status = 'applied'
),
footprint AS (
  SELECT nomenclature_id, count(DISTINCT location_id) AS locations_expected
  FROM e GROUP BY 1
)
SELECT
  e.count_day,
  e.nomenclature_id,
  n.product_code,
  n.name                                    AS item_name,
  n.base_unit,
  n.count_class,
  round(sum(e.counted_qty), 6)              AS counted_qty,
  count(DISTINCT e.location_id)             AS locations_counted,
  f.locations_expected,
  count(DISTINCT e.station_id)              AS stations_counted,
  (count(DISTINCT e.location_id) >= f.locations_expected) AS is_complete,
  round(sum(e.counted_qty) * COALESCE(n.cost_per_unit, 0), 4) AS counted_thb
FROM e
JOIN nomenclature n ON n.id = e.nomenclature_id
JOIN footprint f    ON f.nomenclature_id = e.nomenclature_id
GROUP BY e.count_day, e.nomenclature_id, n.product_code, n.name, n.base_unit,
         n.count_class, n.cost_per_unit, f.locations_expected;

COMMENT ON VIEW v_analytics_count_days IS
  'S1 analytics: confirmed stocktake quantities summed across locations per count day. is_complete compares locations counted that day against the item historical count footprint; incomplete items are excluded from v_analytics_stock_variance to avoid phantom shortages.';

-- -----------------------------------------------------------------------------
-- 11. v_analytics_stock_variance  -- grain: count interval x item
--     Periodic count-to-count model (spec 2 and 6):
--       expected_closing = opening + purchases - usage - waste
--       variance         = expected_closing - closing   (positive = missing)
--     Interval is (previous count day, this count day]. Returns no rows until a
--     second count day exists - that is correct, not a bug.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_stock_variance
WITH (security_invoker = true) AS
WITH RECURSIVE pf_explosion AS (          -- kept in sync with v_analytics_usage_weekly
  SELECT
    b.parent_id AS pf_id,
    b.ingredient_id,
    (b.quantity_per_unit * (1 + COALESCE(b.yield_loss_pct, 0) / 100.0))::numeric AS qty_per_pf,
    1 AS depth
  FROM bom_structures b
  JOIN nomenclature p ON p.id = b.parent_id AND p.product_code LIKE 'PF-%'
  UNION ALL
  SELECT
    e.pf_id, b.ingredient_id,
    (e.qty_per_pf * b.quantity_per_unit * (1 + COALESCE(b.yield_loss_pct, 0) / 100.0))::numeric,
    e.depth + 1
  FROM pf_explosion e
  JOIN bom_structures b ON b.parent_id = e.ingredient_id
  WHERE e.depth < 3
),
pf_to_leaf AS (
  SELECT e.pf_id, e.ingredient_id AS leaf_id, sum(e.qty_per_pf) AS qty_per_pf
  FROM pf_explosion e
  JOIN nomenclature ln ON ln.id = e.ingredient_id
  WHERE ln.product_code NOT LIKE 'PF-%'
  GROUP BY 1, 2
),
mv_daily AS (
  SELECT
    sm.nomenclature_id AS item_id,
    (sm.created_at AT TIME ZONE 'Asia/Bangkok')::date AS d,
    sum(-sm.qty_delta) AS qty
  FROM stock_movements sm
  WHERE sm.reason IN ('loyverse_sale', 'loyverse_refund')
  GROUP BY 1, 2
),
usage_daily AS (
  SELECT d, item_id, sum(qty) AS qty FROM (
    SELECT m.d, m.item_id, m.qty FROM mv_daily m
    UNION ALL
    SELECT m.d, t.leaf_id, sum(m.qty * t.qty_per_pf)
    FROM mv_daily m
    JOIN nomenclature p ON p.id = m.item_id AND p.product_code LIKE 'PF-%'
    JOIN pf_to_leaf t   ON t.pf_id = m.item_id
    GROUP BY m.d, t.leaf_id
  ) u GROUP BY 1, 2
),
cf_by_sku AS (
  SELECT sku_id, conversion_factor FROM (
    SELECT sc.sku_id, sc.conversion_factor,
           row_number() OVER (PARTITION BY sc.sku_id
                              ORDER BY sc.updated_at DESC NULLS LAST,
                                       sc.verified_at DESC NULLS LAST, sc.id) AS rn
    FROM supplier_catalog sc
    WHERE sc.sku_id IS NOT NULL AND sc.conversion_factor IS NOT NULL AND sc.conversion_factor <> 0
  ) q WHERE rn = 1
),
cf_by_item AS (
  SELECT supplier_id, nomenclature_id, conversion_factor FROM (
    SELECT sc.supplier_id, sc.nomenclature_id, sc.conversion_factor,
           row_number() OVER (PARTITION BY sc.supplier_id, sc.nomenclature_id
                              ORDER BY sc.updated_at DESC NULLS LAST,
                                       sc.verified_at DESC NULLS LAST, sc.id) AS rn
    FROM supplier_catalog sc
    WHERE sc.nomenclature_id IS NOT NULL AND sc.supplier_id IS NOT NULL
      AND sc.conversion_factor IS NOT NULL AND sc.conversion_factor <> 0
  ) q WHERE rn = 1
),
purchases_daily AS (
  SELECT
    pl.nomenclature_id AS item_id,
    pl.invoice_date    AS d,
    sum(pl.quantity * COALESCE(cs.conversion_factor, ci.conversion_factor, 1)) AS qty,
    sum(pl.total_price) AS thb
  FROM purchase_logs pl
  LEFT JOIN cf_by_sku  cs ON cs.sku_id = pl.sku_id
  LEFT JOIN cf_by_item ci ON ci.supplier_id = pl.supplier_id
                         AND ci.nomenclature_id = pl.nomenclature_id
  GROUP BY 1, 2
),
waste_daily AS (
  SELECT wl.nomenclature_id AS item_id,
         (wl.created_at AT TIME ZONE 'Asia/Bangkok')::date AS d,
         sum(wl.quantity) AS qty
  FROM waste_logs wl
  GROUP BY 1, 2
),
days AS (
  SELECT DISTINCT count_day FROM v_analytics_count_days
),
intervals AS (
  SELECT
    count_day                                        AS closing_day,
    lag(count_day) OVER (ORDER BY count_day)         AS opening_day
  FROM days
),
scoped AS (
  SELECT i.opening_day, i.closing_day, c.nomenclature_id,
         c.counted_qty AS closing_qty, c.is_complete, c.count_class
  FROM intervals i
  JOIN v_analytics_count_days c ON c.count_day = i.closing_day
  WHERE i.opening_day IS NOT NULL
)
SELECT
  s.opening_day,
  s.closing_day,
  (s.closing_day - s.opening_day)               AS days_in_interval,
  s.nomenclature_id,
  n.product_code,
  n.name                                        AS item_name,
  n.base_unit,
  s.count_class,
  s.is_complete,
  round(COALESCE(op.counted_qty, 0), 6)         AS opening_qty,
  round(COALESCE(p.qty, 0), 6)                  AS purchases_qty,
  round(COALESCE(p.thb, 0), 2)                  AS purchases_thb,
  round(COALESCE(u.qty, 0), 6)                  AS usage_qty,
  round(COALESCE(w.qty, 0), 6)                  AS waste_qty,
  round(COALESCE(op.counted_qty, 0) + COALESCE(p.qty, 0)
        - COALESCE(u.qty, 0) - COALESCE(w.qty, 0), 6) AS expected_closing_qty,
  round(s.closing_qty, 6)                       AS closing_qty,
  round(COALESCE(op.counted_qty, 0) + COALESCE(p.qty, 0)
        - COALESCE(u.qty, 0) - COALESCE(w.qty, 0) - s.closing_qty, 6) AS variance_qty,
  round((COALESCE(op.counted_qty, 0) + COALESCE(p.qty, 0)
        - COALESCE(u.qty, 0) - COALESCE(w.qty, 0) - s.closing_qty)
        * COALESCE(n.cost_per_unit, 0), 2)      AS variance_thb,
  round(100.0 * (COALESCE(op.counted_qty, 0) + COALESCE(p.qty, 0)
        - COALESCE(u.qty, 0) - COALESCE(w.qty, 0) - s.closing_qty)
        / NULLIF(COALESCE(u.qty, 0), 0), 2)     AS variance_pct_of_usage
FROM scoped s
JOIN nomenclature n ON n.id = s.nomenclature_id
LEFT JOIN v_analytics_count_days op
       ON op.count_day = s.opening_day AND op.nomenclature_id = s.nomenclature_id
LEFT JOIN (
  SELECT i.opening_day, i.closing_day, pd.item_id, sum(pd.qty) qty, sum(pd.thb) thb
  FROM intervals i JOIN purchases_daily pd
    ON pd.d > i.opening_day AND pd.d <= i.closing_day
  WHERE i.opening_day IS NOT NULL
  GROUP BY 1, 2, 3
) p ON p.opening_day = s.opening_day AND p.closing_day = s.closing_day AND p.item_id = s.nomenclature_id
LEFT JOIN (
  SELECT i.opening_day, i.closing_day, ud.item_id, sum(ud.qty) qty
  FROM intervals i JOIN usage_daily ud
    ON ud.d > i.opening_day AND ud.d <= i.closing_day
  WHERE i.opening_day IS NOT NULL
  GROUP BY 1, 2, 3
) u ON u.opening_day = s.opening_day AND u.closing_day = s.closing_day AND u.item_id = s.nomenclature_id
LEFT JOIN (
  SELECT i.opening_day, i.closing_day, wd.item_id, sum(wd.qty) qty
  FROM intervals i JOIN waste_daily wd
    ON wd.d > i.opening_day AND wd.d <= i.closing_day
  WHERE i.opening_day IS NOT NULL
  GROUP BY 1, 2, 3
) w ON w.opening_day = s.opening_day AND w.closing_day = s.closing_day AND w.item_id = s.nomenclature_id
WHERE s.is_complete;

COMMENT ON VIEW v_analytics_stock_variance IS
  'S1 analytics: periodic count-to-count variance. expected_closing = opening + purchases - usage - waste; variance = expected - counted (positive = stock missing). Interval is (previous count day, this count day]. Items with is_complete=false are excluded. THB uses current cost_per_unit (accepted v1 WAC bias, spec 8). Empty until a second count day exists.';

-- -----------------------------------------------------------------------------
-- 12. v_analytics_food_cost_weekly  -- grain: week
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_food_cost_weekly
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT week,
         sum(gross_revenue) AS revenue,
         sum(receipts)      AS receipts
  FROM v_analytics_sales_daily GROUP BY 1
),
cogs AS (
  SELECT i.week, sum(i.units * COALESCE(dcs.food_cost, 0)) AS cogs_theoretical
  FROM v_analytics_item_sales_daily i
  JOIN v_dish_cost_split dcs ON dcs.dish_id = i.nomenclature_id
  WHERE NOT i.is_modifier
  GROUP BY 1
),
pur AS (
  SELECT week, sum(thb) FILTER (WHERE is_canonical) AS purchases_thb_canonical,
         sum(thb)                                   AS purchases_thb_all
  FROM v_analytics_purchases_weekly GROUP BY 1
),
inv AS (   -- value on hand per count day
  SELECT count_day, sum(counted_thb) AS inventory_thb
  FROM v_analytics_count_days GROUP BY 1
)
SELECT
  r.week,
  round(r.revenue, 2)                        AS revenue,
  r.receipts,
  round(COALESCE(c.cogs_theoretical, 0), 2)  AS cogs_theoretical,
  round(COALESCE(p.purchases_thb_canonical, 0), 2) AS purchases_thb_canonical,
  round(COALESCE(p.purchases_thb_all, 0), 2)       AS purchases_thb_all,
  i_end.inventory_thb                        AS inventory_close_thb,
  i_start.inventory_thb                      AS inventory_open_thb,
  CASE WHEN i_start.inventory_thb IS NOT NULL AND i_end.inventory_thb IS NOT NULL
       THEN round(i_end.inventory_thb - i_start.inventory_thb, 2) END AS inventory_delta_thb,
  CASE WHEN i_start.inventory_thb IS NOT NULL AND i_end.inventory_thb IS NOT NULL
       THEN round(COALESCE(p.purchases_thb_canonical, 0)
                  - (i_end.inventory_thb - i_start.inventory_thb), 2)
       ELSE round(COALESCE(p.purchases_thb_canonical, 0), 2) END       AS cogs_actual,
  CASE WHEN i_start.inventory_thb IS NOT NULL AND i_end.inventory_thb IS NOT NULL
       THEN 'count_bracketed' ELSE 'purchases_based' END               AS cogs_actual_basis,
  round(100.0 * COALESCE(c.cogs_theoretical, 0) / NULLIF(r.revenue, 0), 2) AS fc_theoretical_pct,
  round(100.0 * (CASE WHEN i_start.inventory_thb IS NOT NULL AND i_end.inventory_thb IS NOT NULL
                      THEN COALESCE(p.purchases_thb_canonical, 0) - (i_end.inventory_thb - i_start.inventory_thb)
                      ELSE COALESCE(p.purchases_thb_canonical, 0) END)
        / NULLIF(r.revenue, 0), 2)                                     AS fc_actual_pct,
  round((CASE WHEN i_start.inventory_thb IS NOT NULL AND i_end.inventory_thb IS NOT NULL
              THEN COALESCE(p.purchases_thb_canonical, 0) - (i_end.inventory_thb - i_start.inventory_thb)
              ELSE COALESCE(p.purchases_thb_canonical, 0) END)
        - COALESCE(c.cogs_theoretical, 0), 2)                          AS gap_thb
FROM rev r
LEFT JOIN cogs c ON c.week = r.week
LEFT JOIN pur  p ON p.week = r.week
LEFT JOIN inv i_start ON i_start.count_day = r.week
LEFT JOIN inv i_end   ON i_end.count_day   = r.week + 6;

COMMENT ON VIEW v_analytics_food_cost_weekly IS
  'S1 analytics: theoretical vs actual food cost per week. cogs_theoretical = units * v_dish_cost_split.food_cost (dish lines only). cogs_actual subtracts the inventory delta only when BOTH week ends are count days (cogs_actual_basis=count_bracketed); otherwise it is purchases-based and must be labelled as such in the UI. gap_thb = actual - theoretical.';

-- -----------------------------------------------------------------------------
-- 13. v_analytics_inventory_value  -- grain: item x location
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_inventory_value
WITH (security_invoker = true) AS
SELECT
  l.nomenclature_id,
  l.product_code,
  l.name                                     AS item_name,
  l.base_unit,
  l.location_id,
  loc.name                                   AS location_name,
  round(l.counted_qty, 6)                    AS counted_qty,
  COALESCE(n.cost_per_unit, 0)               AS cost_per_unit,
  round(l.counted_qty * COALESCE(n.cost_per_unit, 0), 2) AS value_thb,
  (l.created_at AT TIME ZONE 'Asia/Bangkok')::date       AS counted_on,
  (CURRENT_DATE - (l.created_at AT TIME ZONE 'Asia/Bangkok')::date) AS days_since_count,
  n.count_class,
  (n.product_code NOT LIKE 'RAW-AUTO-%' AND NOT COALESCE(n.is_deleted, false)) AS is_canonical
FROM v_stock_latest_by_location l
JOIN nomenclature n     ON n.id = l.nomenclature_id
LEFT JOIN locations loc ON loc.id = l.location_id;

COMMENT ON VIEW v_analytics_inventory_value IS
  'S1 analytics: latest counted quantity per item per location valued at current cost_per_unit, with days since the count. Reuses v_stock_latest_by_location.';

-- -----------------------------------------------------------------------------
-- 14. v_analytics_waste_weekly  -- grain: week x reason
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analytics_waste_weekly
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', wl.created_at AT TIME ZONE 'Asia/Bangkok')::date AS week,
  wl.reason::text                                     AS reason,
  count(*)                                            AS entries,
  count(DISTINCT wl.nomenclature_id)                  AS items,
  round(sum(wl.quantity), 6)                          AS qty,
  round(sum(wl.quantity * COALESCE(n.cost_per_unit, 0)), 2) AS thb,
  round(sum(wl.quantity * COALESCE(n.cost_per_unit, 0)) FILTER (WHERE wl.financial_liability = 'cafe'), 2)     AS thb_liability_cafe,
  round(sum(wl.quantity * COALESCE(n.cost_per_unit, 0)) FILTER (WHERE wl.financial_liability = 'employee'), 2) AS thb_liability_employee,
  round(sum(wl.quantity * COALESCE(n.cost_per_unit, 0)) FILTER (WHERE wl.financial_liability = 'supplier'), 2) AS thb_liability_supplier
FROM waste_logs wl
JOIN nomenclature n ON n.id = wl.nomenclature_id
GROUP BY 1, 2;

COMMENT ON VIEW v_analytics_waste_weekly IS
  'S1 analytics: weekly waste by reason, valued at current cost_per_unit, split by financial_liability. waste_logs is empty as of 2026-10-16 - Phase 0.4 fills it.';

-- -----------------------------------------------------------------------------
-- Grants: security_invoker views, so the caller's RLS on the base tables still
-- applies. Owner gating of the /analytics screens stays UI-level (spec 8).
-- -----------------------------------------------------------------------------
GRANT SELECT ON v_analytics_sales_daily,
                v_analytics_item_sales_daily,
                v_analytics_hourly_heat,
                v_analytics_abc_items,
                v_analytics_purchases_weekly,
                v_analytics_purchase_coverage_weekly,
                v_analytics_price_watch,
                v_analytics_usage_weekly,
                v_analytics_bom_coverage_weekly,
                v_analytics_count_days,
                v_analytics_stock_variance,
                v_analytics_food_cost_weekly,
                v_analytics_inventory_value,
                v_analytics_waste_weekly
          TO authenticated;

-- -----------------------------------------------------------------------------
-- Spec 3.3 -- populate nomenclature.count_class from the ABC view.
-- Idempotent and re-runnable; re-run monthly and after the MC 00a81c22 backfill.
-- A manual classification (count_class_source='manual') is never overwritten.
-- Touches no other column, so none of the nomenclature UPDATE triggers fire
-- (they are all scoped to cost_per_unit / price / nutrition / is_deleted / etc).
-- -----------------------------------------------------------------------------
UPDATE nomenclature n
SET count_class        = a.count_class,
    count_class_source = 'auto'
FROM v_analytics_abc_items a
WHERE a.nomenclature_id = n.id
  AND a.count_class IS NOT NULL
  AND COALESCE(n.count_class_source, 'auto') = 'auto'
  AND (n.count_class IS DISTINCT FROM a.count_class
       OR n.count_class_source IS NULL);

-- -----------------------------------------------------------------------------
-- RULE-MIGRATION-TRACKING self-register (checksum NULL by rule)
-- -----------------------------------------------------------------------------
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '466b_analytics_views_s1.sql',
  'claude-code',
  NULL,
  'S1 stock-control analytics: 14 v_analytics_* security_invoker views (Asia/Bangkok ISO weeks, refund-aware, PF->RAW explosion depth<=3) + nomenclature.count_class ABC population (MC 1be5f592)'
)
ON CONFLICT DO NOTHING;
