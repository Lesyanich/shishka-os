-- ============================================================
-- Migration 135: Data Health — Categorize zero-waste by-product ingredients
--
-- Follow-up to docs/superpowers/specs/2026-04-14-data-health-makro-design.md.
--
-- Problem: v_data_health reports 109 orphan_items (info-level, no score penalty).
-- Breakdown revealed 6 of those are legitimately zero-cost zero-waste by-products
-- harvested from other ingredients — cores, stems, trimmings, RO water — all
-- consumed by PF-VEGETABLE_BROTH (plus RO-WATER usage). Their "orphan" status
-- (never purchased) is by design, not a data quality issue.
--
-- Fix: assign them the existing F-ZW-BYP category ("Zero-Waste By-products")
-- so the modeling is accurate. cost_per_unit=0 is correct for these rows.
--
-- Note: this does NOT reduce the orphan_items metric — the metric only filters
-- by is_available and product_code prefix. We could later extend v_data_health
-- to exclude F-ZW-BYP items from the orphan count if needed, but the metric
-- is already info-level so there's no scoring urgency.
-- ============================================================

UPDATE public.nomenclature n
   SET category_id = pc.id,
       updated_at  = now()
  FROM public.product_categories pc
 WHERE pc.code = 'F-ZW-BYP'
   AND n.product_code IN (
     'RAW-CABBAGE-CORES',
     'RAW-HERB-STEMS',
     'RAW-MUSHROOM-STEMS',
     'RAW-ONION-TRIMMINGS',
     'RAW-ROOT-TRIMMINGS',
     'RAW-RO-WATER'
   )
   AND n.category_id IS DISTINCT FROM pc.id;  -- idempotency

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '135_data_health_categorize_zero_waste.sql',
  'claude-code',
  NULL,
  'Categorize 6 zero-waste by-product ingredients (cores, stems, trimmings, RO water) as F-ZW-BYP. Cost=0 is correct for these rows; they derive from other ingredients rather than being purchased.'
) ON CONFLICT (filename) DO NOTHING;
