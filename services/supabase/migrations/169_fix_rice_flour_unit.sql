-- ============================================================
-- Migration 169: Data Health — fix RAW-d9cd5a8b (Ercho Rice Flour)
--                base_unit: pcs → kg
--
-- MC task: 627a70df-9354-43fe-8ba3-4af95ed19336
--
-- PROBLEM:
--   Ercho Rice Flour landed with base_unit='pcs', cost_per_unit=33.
--   Pack size is 1 kg, so cost is correctly 33 THB but the unit
--   semantic is wrong. PF-MANAISH_DOUGH_POTATO BOM consumes
--   0.2 kg of this ingredient — kg-vs-pcs mismatch breaks cost
--   rollup and prevents accurate margin calculation.
--
-- FIX:
--   UPDATE base_unit pcs → kg. cost_per_unit stays 33 (pack=1kg,
--   so price-per-pack equals price-per-kg). Nutrition values are
--   already populated correctly per kg.
--
-- AUDIT:
--   Logged in data_health_decisions with decision_source='manual_edit'
--   and rule_code=NOMENCLATURE_INVALID_BASE_UNIT (not strictly invalid,
--   but the nearest applicable rule for this entity_kind/field).
--
-- OUT OF SCOPE (separate MC task):
--   RAW-5a458281 (Divella Farina Flour) has the same pcs/kg mismatch.
-- ============================================================

BEGIN;

-- ─── 1. Capture pre-state for audit ───
DO $$
DECLARE
  v_old_unit TEXT;
  v_rule_id  UUID;
  v_run_id   UUID := gen_random_uuid();
BEGIN
  SELECT base_unit INTO v_old_unit
    FROM public.nomenclature
   WHERE id = 'd411c6ec-b843-46c7-8cd4-eba0f6efe19a';

  IF v_old_unit IS NULL THEN
    RAISE EXCEPTION 'Rice flour row d411c6ec not found — migration aborted';
  END IF;

  IF v_old_unit = 'kg' THEN
    RAISE NOTICE 'Rice flour already kg — migration is no-op';
    RETURN;
  END IF;

  IF v_old_unit <> 'pcs' THEN
    RAISE EXCEPTION 'Unexpected base_unit %, expected pcs — aborting for safety', v_old_unit;
  END IF;

  -- ─── 2. Apply fix ───
  UPDATE public.nomenclature
     SET base_unit = 'kg',
         updated_at = now()
   WHERE id = 'd411c6ec-b843-46c7-8cd4-eba0f6efe19a';

  -- ─── 3. Audit log ───
  SELECT id INTO v_rule_id
    FROM public.data_health_rules
   WHERE rule_code = 'NOMENCLATURE_INVALID_BASE_UNIT';

  INSERT INTO public.data_health_decisions
    (run_id, rule_id, entity_kind, entity_id, field, old_value, new_value,
     decision_source, decided_by, notes)
  VALUES
    (v_run_id,
     v_rule_id,
     'nomenclature',
     'd411c6ec-b843-46c7-8cd4-eba0f6efe19a',
     'base_unit',
     v_old_unit,
     'kg',
     'manual_edit',
     'claude-opus-session-72f2077a',
     'MC 627a70df: pack=1kg, cost stays 33 THB. Fixes BOM cost rollup for PF-MANAISH_DOUGH_POTATO (consumes 0.2 kg).');
END $$;

-- ─── 4. migration_log self-register ───
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '169_fix_rice_flour_unit.sql',
  'claude-opus-session-72f2077a',
  'MC 627a70df: RAW-d9cd5a8b (Ercho Rice Flour) base_unit pcs→kg. Single-row data fix with audit in data_health_decisions.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
