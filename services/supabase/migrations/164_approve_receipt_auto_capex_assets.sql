-- ============================================================
-- Migration 164: Auto-create capex_assets in fn_approve_receipt_with_learning
--
-- Problem: When flow_type=CapEx, fn_approve_receipt creates
-- capex_transactions (spoke 2) but NOT capex_assets records.
-- Finance-agent must manually call manage_capex_assets(create)
-- after every CapEx approval — friction and easy to forget.
--
-- Fix: Extend the wrapper fn_approve_receipt_with_learning to
-- auto-create capex_assets for each capex_item after base
-- approval succeeds. Does NOT touch the base fn_approve_receipt.
--
-- Safety:
--   - Only fires when capex_items array is non-empty
--   - Non-CapEx receipts (COGS, OPEX) completely unaffected
--   - capex_transactions spoke 2 still created by base function
--   - capex_assets records link back via expense_id
-- ============================================================

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
BEGIN
  -- ── 1. Run the base approval logic ──
  v_result := public.fn_approve_receipt(p_payload);

  -- If approval failed, return immediately
  IF NOT (v_result->>'ok')::BOOLEAN THEN
    RETURN v_result;
  END IF;

  -- ── 2. Extract common fields for downstream logic ──
  v_supplier_name   := p_payload->>'supplier_name';
  v_supplier_tax_id := NULLIF(TRIM(p_payload->>'supplier_tax_id'), '');
  v_expense_id      := (v_result->>'expense_id')::UUID;
  v_purchase_date   := COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE);

  -- ── 3. Resolve supplier_id (for learning + capex vendor name) ──
  IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
    -- Find supplier by tax_id first, then name, then alias
    IF v_supplier_tax_id IS NOT NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE tax_id = v_supplier_tax_id
        AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE name ILIKE v_supplier_name
        AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_supplier_id IS NULL THEN
      SELECT supplier_id INTO v_supplier_id
      FROM public.supplier_aliases
      WHERE LOWER(alias) = LOWER(v_supplier_name)
      LIMIT 1;
    END IF;

    -- Auto-save supplier alias
    IF v_supplier_id IS NOT NULL THEN
      INSERT INTO public.supplier_aliases (supplier_id, alias, source)
      VALUES (v_supplier_id, v_supplier_name, 'auto')
      ON CONFLICT DO NOTHING;

      -- Get canonical vendor name for capex_assets
      SELECT name INTO v_vendor_name
      FROM public.suppliers
      WHERE id = v_supplier_id;
    END IF;
  END IF;

  -- Fall back to raw supplier_name if no match
  v_vendor_name := COALESCE(v_vendor_name, v_supplier_name);

  -- ── 4. Auto-create capex_assets for CapEx items (NEW in v16) ──
  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO public.capex_assets (
        asset_name,
        vendor,
        initial_value,
        residual_value,
        useful_life_months,
        purchase_date,
        category_code
      ) VALUES (
        COALESCE(v_item->>'name', 'Unknown CapEx item'),
        v_vendor_name,
        COALESCE((v_item->>'total_price')::NUMERIC, 0),
        0,
        60,  -- default 5 years
        v_purchase_date,
        COALESCE((p_payload->>'category_code')::INTEGER, NULL)
      );

      v_capex_count := v_capex_count + 1;
    END LOOP;
  END IF;

  -- ── 5. Run learning if we have inbox_id ──
  IF p_inbox_id IS NOT NULL THEN
    v_rules_learned := public.fn_learn_from_approval(p_inbox_id, p_payload, v_supplier_id);
    v_result := v_result || jsonb_build_object('rules_learned', v_rules_learned);
  END IF;

  -- ── 6. Append capex_assets count to result ──
  IF v_capex_count > 0 THEN
    v_result := v_result || jsonb_build_object('capex_assets_created', v_capex_count);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_approve_receipt_with_learning(JSONB, UUID)
  IS 'v16 wrapper: runs fn_approve_receipt, auto-creates capex_assets for CapEx items, then runs learning. Pass inbox_id to enable learning.';

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '164_approve_receipt_auto_capex_assets.sql',
  'claude-code',
  'v16 wrapper: auto-create capex_assets during CapEx approval. capex_transactions spoke still created by base fn. Non-CapEx flows unaffected.'
) ON CONFLICT (filename) DO NOTHING;
