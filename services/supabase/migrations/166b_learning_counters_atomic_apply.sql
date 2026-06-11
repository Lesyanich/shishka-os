-- ============================================================
-- Migration 166: Wire learning counters atomically
--
-- Follow-up to WS-4 (mig 165, MC 30808669) and 15f2a50f.
--
-- Discovery: mig 165 added counter columns to correction_rules,
-- but no code path applies correction_rules during ingestion —
-- the actual functioning apply phase is for category_overrides
-- (services/supabase/functions/_shared/learning.ts), and its
-- existing times_applied increment is fire-and-forget (violates
-- RULE-LEARNING-COUNTERS atomicity).
--
-- This migration:
--   1. Adds counter columns to category_overrides, supplier_aliases,
--      gs1_weight_items so v_learning_metrics can aggregate the
--      whole self-learning surface (not just correction_rules).
--   2. Adds receipt_inbox.applied_overrides jsonb — records which
--      rules fired during ocr-receipt's apply phase.
--   3. Adds fn_apply_inbox_overrides(p_inbox_id, p_payload) — diffs
--      applied_overrides against the approved payload and increments
--      times_applied / times_overridden atomically. Run inside the
--      same transaction as the expense_ledger persist by hooking it
--      into fn_approve_receipt_with_learning (replaced below).
--   4. Replaces v_learning_metrics view to UNION over all 4 tables.
--
-- Out of scope:
--   - Apply phase for correction_rules (no code reads from it yet).
--     Counters present from mig 165 — wire if/when ingestion path
--     consults the table.
--   - Counter wiring for supplier_aliases and gs1_weight_items.
--     Schema columns added so future wiring is a code-only change;
--     for v1 only category_overrides has end-to-end wiring.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- CREATE OR REPLACE VIEW.
-- ============================================================

-- ── 1. Counter columns on the three tables that have apply phases ──
ALTER TABLE public.category_overrides
  ADD COLUMN IF NOT EXISTS times_overridden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_applied_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.category_overrides.times_overridden IS
  'How many times an admin manually re-classified an item that this rule had auto-categorized. High ratio vs times_applied = stale rule.';
COMMENT ON COLUMN public.category_overrides.last_applied_at IS
  'Timestamp of most recent successful auto-application (rule fired and admin kept the value). NULL = never applied.';

ALTER TABLE public.supplier_aliases
  ADD COLUMN IF NOT EXISTS times_applied    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_overridden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_applied_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.supplier_aliases.times_applied IS
  'How many times this alias mapped an OCR supplier_name to a known supplier_id. Wiring in follow-up; column reserved for /health aggregation.';
COMMENT ON COLUMN public.supplier_aliases.times_overridden IS
  'How many times the admin changed the resolved supplier_id after this alias fired. Wiring follow-up.';

ALTER TABLE public.gs1_weight_items
  ADD COLUMN IF NOT EXISTS times_applied    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_overridden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_applied_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.gs1_weight_items.times_applied IS
  'How many times this base barcode resolved a GS1 weight item. Wiring follow-up.';
COMMENT ON COLUMN public.gs1_weight_items.times_overridden IS
  'How many times admin re-mapped the nomenclature_id after this entry fired. Wiring follow-up.';

-- ── 2. receipt_inbox.applied_overrides — apply-phase ledger ──
ALTER TABLE public.receipt_inbox
  ADD COLUMN IF NOT EXISTS applied_overrides JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.receipt_inbox.applied_overrides IS
  $$Records which learning rules fired during ocr-receipt apply phase.
Shape: [{ "table": "category_overrides", "rule_id": "uuid", "item_match_key": "lowercased original_name", "suggested_flow_type": "COGS"|"OpEx"|"CapEx" }, ...].
Read by fn_apply_inbox_overrides on approval to increment times_applied / times_overridden atomically.$$;

-- ── 3. fn_apply_inbox_overrides — atomic diff + counter update ──
-- Called from fn_approve_receipt_with_learning AFTER fn_approve_receipt
-- writes the expense_ledger row, INSIDE the same transaction. If the
-- transaction rolls back, counters stay untouched.
CREATE OR REPLACE FUNCTION public.fn_apply_inbox_overrides(
  p_inbox_id UUID,
  p_payload  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_overrides     JSONB;
  v_entry         JSONB;
  v_table         TEXT;
  v_rule_id       UUID;
  v_match_key     TEXT;
  v_suggested     TEXT;
  v_actual        TEXT;
  v_applied_cnt   INTEGER := 0;
  v_overridden_cnt INTEGER := 0;
BEGIN
  IF p_inbox_id IS NULL THEN
    RETURN jsonb_build_object('applied', 0, 'overridden', 0);
  END IF;

  SELECT applied_overrides INTO v_overrides
  FROM public.receipt_inbox
  WHERE id = p_inbox_id;

  IF v_overrides IS NULL OR jsonb_array_length(v_overrides) = 0 THEN
    RETURN jsonb_build_object('applied', 0, 'overridden', 0);
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_overrides)
  LOOP
    v_table     := v_entry->>'table';
    v_rule_id   := NULLIF(v_entry->>'rule_id', '')::UUID;
    v_match_key := LOWER(COALESCE(v_entry->>'item_match_key', ''));
    v_suggested := v_entry->>'suggested_flow_type';

    IF v_rule_id IS NULL OR v_match_key = '' THEN CONTINUE; END IF;

    -- v1 wires only category_overrides. Other tables: skip silently
    -- (their counters stay 0 until apply-phase wiring lands).
    IF v_table <> 'category_overrides' THEN CONTINUE; END IF;

    -- Locate the item in the approved payload by lowercased original_name
    -- to determine where it actually landed.
    v_actual := NULL;

    IF v_actual IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'food_items', '[]'::jsonb)) f
      WHERE LOWER(COALESCE(f->>'original_name', f->>'name', '')) = v_match_key
    ) THEN
      v_actual := 'COGS';
    END IF;

    IF v_actual IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'opex_items', '[]'::jsonb)) o
      WHERE LOWER(COALESCE(o->>'original_name', o->>'description', o->>'name', '')) = v_match_key
    ) THEN
      v_actual := 'OpEx';
    END IF;

    IF v_actual IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'capex_items', '[]'::jsonb)) c
      WHERE LOWER(COALESCE(c->>'original_name', c->>'name', '')) = v_match_key
    ) THEN
      v_actual := 'CapEx';
    END IF;

    -- Decision:
    --   actual = suggested → rule was correct → applied++
    --   actual != suggested OR item dropped → admin overrode → overridden++
    IF v_actual = v_suggested THEN
      UPDATE public.category_overrides
      SET times_applied   = times_applied + 1,
          last_applied_at = now()
      WHERE id = v_rule_id;
      v_applied_cnt := v_applied_cnt + 1;
    ELSE
      UPDATE public.category_overrides
      SET times_overridden = times_overridden + 1
      WHERE id = v_rule_id;
      v_overridden_cnt := v_overridden_cnt + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied_cnt, 'overridden', v_overridden_cnt);
END;
$$;

COMMENT ON FUNCTION public.fn_apply_inbox_overrides(UUID, JSONB) IS
  'Diffs receipt_inbox.applied_overrides against the approved payload and atomically updates category_overrides.times_applied / times_overridden / last_applied_at. Called from fn_approve_receipt_with_learning inside the approval transaction (RULE-LEARNING-COUNTERS atomicity).';

-- ── 4. fn_approve_receipt_with_learning — hook in fn_apply_inbox_overrides ──
-- Replaces the v16 wrapper from mig 164. Adds a single call to
-- fn_apply_inbox_overrides after the auto-capex step. Same transaction.
-- Non-inbox approvals (mcp-finance with NULL inbox_id) skip the call —
-- function handles NULL gracefully and returns zero counts.
CREATE OR REPLACE FUNCTION public.fn_approve_receipt_with_learning(
  p_payload JSONB,
  p_inbox_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result           JSONB;
  v_supplier_id      UUID;
  v_supplier_name    TEXT;
  v_supplier_tax_id  TEXT;
  v_rules_learned    INTEGER;
  v_item             JSONB;
  v_capex_count      INTEGER := 0;
  v_expense_id       UUID;
  v_vendor_name      TEXT;
  v_purchase_date    DATE;
  v_apply_result     JSONB;
BEGIN
  -- ── 1. Run the base approval logic ──
  v_result := public.fn_approve_receipt(p_payload);

  IF NOT (v_result->>'ok')::BOOLEAN THEN
    RETURN v_result;
  END IF;

  -- ── 2. Common fields ──
  v_supplier_name   := p_payload->>'supplier_name';
  v_supplier_tax_id := NULLIF(TRIM(p_payload->>'supplier_tax_id'), '');
  v_expense_id      := (v_result->>'expense_id')::UUID;
  v_purchase_date   := COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE);

  -- ── 3. Resolve supplier_id (for learning + capex vendor name) ──
  IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
    IF v_supplier_tax_id IS NOT NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE tax_id = v_supplier_tax_id AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE name ILIKE v_supplier_name AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_supplier_id IS NULL THEN
      SELECT supplier_id INTO v_supplier_id
      FROM public.supplier_aliases
      WHERE LOWER(alias) = LOWER(v_supplier_name)
      LIMIT 1;
    END IF;

    IF v_supplier_id IS NOT NULL THEN
      INSERT INTO public.supplier_aliases (supplier_id, alias, source)
      VALUES (v_supplier_id, v_supplier_name, 'auto')
      ON CONFLICT DO NOTHING;

      SELECT name INTO v_vendor_name
      FROM public.suppliers
      WHERE id = v_supplier_id;
    END IF;
  END IF;

  v_vendor_name := COALESCE(v_vendor_name, v_supplier_name);

  -- ── 4. Auto-create capex_assets for CapEx items ──
  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO public.capex_assets (
        asset_name, vendor, initial_value, residual_value,
        useful_life_months, purchase_date, category_code
      ) VALUES (
        COALESCE(v_item->>'name', 'Unknown CapEx item'),
        v_vendor_name,
        COALESCE((v_item->>'total_price')::NUMERIC, 0),
        0,
        60,
        v_purchase_date,
        COALESCE((p_payload->>'category_code')::INTEGER, NULL)
      );
      v_capex_count := v_capex_count + 1;
    END LOOP;
  END IF;

  -- ── 5. Apply inbox-side rule counters (atomic with persist) ──
  IF p_inbox_id IS NOT NULL THEN
    v_apply_result := public.fn_apply_inbox_overrides(p_inbox_id, p_payload);
    v_result := v_result || jsonb_build_object('rule_counters', v_apply_result);
  END IF;

  -- ── 6. Run post-approval learning (creates new rules from diffs) ──
  IF p_inbox_id IS NOT NULL THEN
    v_rules_learned := public.fn_learn_from_approval(p_inbox_id, p_payload, v_supplier_id);
    v_result := v_result || jsonb_build_object('rules_learned', v_rules_learned);
  END IF;

  -- ── 7. Append capex_assets count to result ──
  IF v_capex_count > 0 THEN
    v_result := v_result || jsonb_build_object('capex_assets_created', v_capex_count);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_approve_receipt_with_learning(JSONB, UUID) IS
  'v17 wrapper: fn_approve_receipt → auto-capex_assets → fn_apply_inbox_overrides (counter increments, atomic) → fn_learn_from_approval (new rules from diff). Pass inbox_id to enable learning + counter wiring.';

-- ── 5. Replace v_learning_metrics — UNION over all 4 learning tables ──
-- Aggregates total_rules, used_rules, sum_applied, sum_overridden,
-- override_rate_pct, last_activity. Tables with no apply-phase
-- wiring contribute zeros to sum_applied/sum_overridden — view
-- still works honestly (override_rate_pct stays NULL until something
-- has been applied).
CREATE OR REPLACE VIEW public.v_learning_metrics AS
WITH unified AS (
  SELECT
    'correction_rules'::text  AS source_table,
    times_applied,
    times_overridden,
    last_applied_at
  FROM public.correction_rules
  UNION ALL
  SELECT 'category_overrides', times_applied, times_overridden, last_applied_at
  FROM public.category_overrides
  UNION ALL
  SELECT 'supplier_aliases', times_applied, times_overridden, last_applied_at
  FROM public.supplier_aliases
  UNION ALL
  SELECT 'gs1_weight_items', times_applied, times_overridden, last_applied_at
  FROM public.gs1_weight_items
)
SELECT
  COUNT(*)                                            AS total_rules,
  COUNT(*) FILTER (WHERE times_applied > 0)           AS used_rules,
  COALESCE(SUM(times_applied), 0)                     AS sum_applied,
  COALESCE(SUM(times_overridden), 0)                  AS sum_overridden,
  CASE
    WHEN COALESCE(SUM(times_applied), 0) = 0 THEN NULL
    ELSE ROUND(
      100.0 * COALESCE(SUM(times_overridden), 0)
        / NULLIF(SUM(times_applied), 0),
      1
    )
  END                                                 AS override_rate_pct,
  MAX(last_applied_at)                                AS last_activity
FROM unified;

COMMENT ON VIEW public.v_learning_metrics IS
  'WS-4 + 15f2a50f: unified self-learning health across correction_rules, category_overrides, supplier_aliases, gs1_weight_items. override_rate_pct > 30 = system is learning the wrong thing — drill into each table ORDER BY times_overridden DESC.';

GRANT SELECT ON public.v_learning_metrics TO anon, authenticated, service_role;

-- ── 6. Self-register ──
INSERT INTO public.migration_log (filename, applied_by, checksum, notes)
VALUES (
  '166b_learning_counters_atomic_apply.sql',
  'claude-code',
  NULL,
  '15f2a50f: counter columns on category_overrides/supplier_aliases/gs1_weight_items + receipt_inbox.applied_overrides + fn_apply_inbox_overrides RPC + fn_approve_receipt_with_learning v17 + v_learning_metrics now UNIONs over all 4 tables. v1 wires only category_overrides; supplier_aliases & gs1 schema-ready for follow-up.'
)
ON CONFLICT DO NOTHING;
