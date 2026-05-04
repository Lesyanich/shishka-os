-- ============================================================
-- Migration 156: Data Health — nomenclature name + base_unit cleanup
--
-- Applied via tools/data-health/run_rules.py apply with CEO review
-- on 2026-04-24. This migration exists to:
--   1. Document the run in migration_log (deterministic replay record)
--   2. Seed a new learned rule (PF/MOD/SALE prefix → base_unit default)
--      so future rows land with the right unit from the start.
--
-- Data changes (already applied via run_rules.py, run_id recorded below):
--   38 name strips    (", XXXg" tail removed)
--   11 base_unit from name tail inference (pack/bag/bottle/box → g/kg/L)
--   14 base_unit manual (CEO-approved precedent: PF=kg/L, MOD=kg/pcs, SALE=portion)
--    1 lowercase l → L fix
--    1 skip          (regex didn't match "4.5L" decimal — flagged for follow-up)
--
-- Backup table: nomenclature_rename_backup_311dc7fe_5a79_4a32_83eb_4cd3ad8de079
-- Decisions:    data_health_decisions WHERE run_id = '311dc7fe-...'
-- ============================================================


-- ─── Learned rule: base_unit convention by product_code prefix ───
--
-- Pattern emerged from CEO review of 14 rows on 2026-04-24:
--   PF-* solids (baked, cooked, fermented, sautéed)   → kg
--   PF-* liquids (broth, soup base, vacuum base)      → L
--   PF-* dough/starter                                → portion
--   MOD-* weighed toppings (sour cream, chicken, etc) → kg
--   MOD-* abstract buckets (toppings, add-ons)        → pcs
--   SALE-* items with "(portion)" in name             → portion
--
-- This rule CATCHES new PF/MOD/SALE rows with base_unit=pcs when there's
-- a better precedent. It runs alongside NOMENCLATURE_INVALID_BASE_UNIT
-- but has lower severity (info, not warn) because pcs is functional,
-- just not convention-matching.

INSERT INTO public.data_health_rules
  (rule_code, title, description, entity_kind, metric, detect_sql, fix_strategy, severity, confidence, created_by)
VALUES (
  'NOMENCLATURE_PREFIX_BASE_UNIT_CONVENTION',
  'Nomenclature base_unit does not match convention for PF/MOD/SALE prefix',
  'PF-* solids are tracked by weight (kg); PF-* liquids by volume (L); PF-* dough by portion. MOD-* weighed toppings are kg; abstract buckets are pcs. SALE-* with "(portion)" in name must be portion. This rule catches new rows that landed as pcs when a better precedent exists. Learned 2026-04-24 from 14 CEO decisions.',
  'nomenclature',
  'prefix_convention_mismatch',
  $sql$SELECT n.id AS entity_id, n.product_code, n.name,
          jsonb_build_object(
            'current',    n.base_unit,
            'prefix',     split_part(n.product_code, '-', 1),
            'has_portion_in_name', n.name ILIKE '%(portion)%'
          ) AS extra_json
     FROM public.nomenclature n
    WHERE n.is_available = TRUE
      AND (
        -- SALE items with "(portion)" in name but not base_unit=portion
        (n.product_code LIKE 'SALE-%' AND n.name ILIKE '%(portion)%'
         AND COALESCE(n.base_unit, '') <> 'portion')
        -- PF/MOD on pcs that should likely be kg or L (non-bucket)
        OR (n.product_code LIKE 'PF-%' AND n.base_unit = 'pcs'
            AND n.name ILIKE ANY(ARRAY['%broth%','%soup%','%base%','%juice%','%sauce%','%baked%','%cooked%','%fermented%','%mash%']))
      )$sql$,
  'set_base_unit_from_prefix_convention',
  'info',
  0.80,
  'claude-opus-session-0424'
)
ON CONFLICT (rule_code) DO NOTHING;


-- ─── Follow-up note: edge case left over ───
-- Row RAW-WHITE VINEGAR 5% "Ercho White Vinegar 5% 4.5L" was skipped
-- because the strip_weight_tail regex doesn't handle decimal "4.5L".
-- Tracked in data_health_decisions with decision_source='skip'.
-- Also: product_code "RAW-WHITE VINEGAR 5%" has spaces — separate issue
-- (product_code_has_spaces metric — future rule).


-- ─── migration_log self-register ───

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '156_data_health_nomenclature_cleanup.sql',
  'claude-code',
  'Data cleanup applied via run_rules.py: 50 auto + 14 CEO-reviewed + 1 skip (run_id 311dc7fe). Seeds prefix-convention rule learned from this pass.'
) ON CONFLICT (filename) DO NOTHING;
