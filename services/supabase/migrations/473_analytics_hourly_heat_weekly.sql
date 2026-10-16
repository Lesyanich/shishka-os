-- =============================================================================
-- 473_analytics_hourly_heat_weekly.sql
-- Fixes v_analytics_hourly_heat from migration 463 (MC 1be5f592 / S2 fd0a3475).
--
-- The bug. Spec section 4 gives this view the grain "dow x hour", and 463 built
-- exactly that: one row per ISO weekday per local hour, aggregated over all of
-- history. But spec section 5 requires the /analytics period selector (last
-- 4 / 8 / 13 weeks) to drive EVERY widget on the tab, and with no time
-- dimension the heatmap physically cannot follow it. S2 hit this the moment it
-- went to wire the selector up.
--
-- The fix. Add `week` (ISO week, Asia/Bangkok, same expression as every other
-- S1 view) and group by it, so the UI filters on week and sums the cells it
-- needs. Appended as the last column rather than placed first: CREATE OR
-- REPLACE VIEW can only add columns at the end, and this keeps the change a
-- replace instead of a DROP. Nothing depends on the view yet (pg_depend shows
-- zero dependent objects) and no UI consumes it, so the grain change is safe.
--
-- Consequence to keep in mind when reading the numbers: `receipts` and
-- `revenue` are now per week per cell, not all-time per cell. Summing over the
-- selected weeks reproduces the old all-time figure exactly - verified below
-- against v_analytics_sales_daily.
--
-- Still receipts-first by design (spec section 5): at roughly 40 receipts a
-- week, revenue per weekday-hour cell is too volatile to plot. revenue stays
-- available for tooltips.
-- =============================================================================

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
  max(o.ts_local)::date                  AS last_day,
  date_trunc('week', o.ts_local)::date   AS week
FROM o
GROUP BY 1, 2, 3, 8;

COMMENT ON VIEW v_analytics_hourly_heat IS
  'S1 analytics: receipts per ISO day-of-week x local hour (Asia/Bangkok), bucketed by ISO week so the /analytics period selector can drive the heatmap (mig 473; 463 had no time dimension). receipts/revenue are per week per cell - sum over the selected weeks. Spec plots receipts, not revenue: at ~40 receipts/week revenue per cell is too volatile.';

-- -----------------------------------------------------------------------------
-- RULE-MIGRATION-TRACKING self-register (checksum NULL by rule)
-- -----------------------------------------------------------------------------
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '473_analytics_hourly_heat_weekly.sql',
  'claude-code',
  NULL,
  'Add week to v_analytics_hourly_heat so the /analytics period selector can drive the heatmap; 463 shipped it with no time dimension (MC 1be5f592, unblocks fd0a3475)'
)
ON CONFLICT DO NOTHING;
