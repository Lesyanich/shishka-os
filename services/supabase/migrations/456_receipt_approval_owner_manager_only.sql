-- 456_receipt_approval_owner_manager_only.sql
-- MC 49cc8776 (found under MC 8ee6783a). CEO 2026-10-09: "исправь дыру с
-- утверждением чеков".
--
-- THE HOLE. fn_approve_receipt_with_learning and the fn_approve_receipt it
-- calls are SECURITY DEFINER, EXECUTE was granted to PUBLIC and anon, and
-- neither checked who was calling. Anyone with the site's public anon key —
-- not logged in — could write rows into the owner-only expense_ledger (plus
-- suppliers, purchase_logs, SKU balances, capex_assets). The admin UI only
-- offers approval on /receipts (owner + task_manager), but that is UI-only.
--
-- AFTER
--   * fn_assert_receipt_approver(): passes for owner/task_manager staff, the
--     service_role key (shishka-finance MCP, scripts/finance-agent-db.mjs),
--     and direct DB sessions (migrations, cron, SQL console — session_user is
--     not 'authenticator'); raises 42501 for everyone else.
--   * fn_approve_receipt_with_learning — the API entry point (admin UI, MCP) —
--     calls it first; EXECUTE revoked from PUBLIC and anon.
--   * fn_approve_receipt — the base. Body untouched. Direct EXECUTE revoked
--     from PUBLIC, anon AND authenticated: its callers are the definer
--     functions fn_approve_receipt_with_learning and fn_approve_po (they run
--     as postgres) and the service_role script, all of which keep access.
--
-- Not in this migration (offered separately): fn_approve_po, fn_approve_payroll,
-- fn_sync_loyverse_payouts_to_ledger, fn_vat_report, fn_validate_reconciliation
-- carry the same PUBLIC/anon grant with no caller check.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_assert_receipt_approver()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- API requests arrive through PostgREST, which logs in as 'authenticator'.
  -- Anything else is a direct DB session (migration, cron, SQL console).
  IF session_user <> 'authenticator' THEN
    RETURN;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF public.fn_has_app_role(ARRAY['owner', 'task_manager']) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Only owners and managers can approve receipts'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assert_receipt_approver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assert_receipt_approver() TO authenticated, service_role;

-- Body as live on 2026-10-09 (pg_get_functiondef), plus the gate as the first
-- statement and an explicit search_path.
CREATE OR REPLACE FUNCTION public.fn_approve_receipt_with_learning(p_payload jsonb, p_inbox_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  -- 0. Only owners, managers and the service role approve receipts (mig 456).
  PERFORM public.fn_assert_receipt_approver();

  -- 1. Run the base approval logic
  v_result := public.fn_approve_receipt(p_payload);

  IF NOT (v_result->>'ok')::BOOLEAN THEN
    RETURN v_result;
  END IF;

  -- 2. Common fields
  v_supplier_name   := p_payload->>'supplier_name';
  v_supplier_tax_id := NULLIF(TRIM(p_payload->>'supplier_tax_id'), '');
  v_expense_id      := (v_result->>'expense_id')::UUID;
  v_purchase_date   := COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE);

  -- 3. Resolve supplier_id via the same resolver as fn_approve_receipt.
  --    p_create = false: the base function already created it if it was new.
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  ELSIF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
    v_supplier_id := public.fn_resolve_supplier(v_supplier_name, v_supplier_tax_id, false);
  END IF;

  IF v_supplier_id IS NOT NULL THEN
    SELECT name INTO v_vendor_name
    FROM public.suppliers
    WHERE id = v_supplier_id;
  END IF;

  v_vendor_name := COALESCE(v_vendor_name, v_supplier_name);

  -- 4. Auto-create capex_assets for CapEx items
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

  -- 5. Apply inbox-side rule counters (atomic with persist)
  IF p_inbox_id IS NOT NULL THEN
    v_apply_result := public.fn_apply_inbox_overrides(p_inbox_id, p_payload);
    v_result := v_result || jsonb_build_object('rule_counters', v_apply_result);
  END IF;

  -- 6. Run post-approval learning (creates new rules from diffs)
  IF p_inbox_id IS NOT NULL THEN
    v_rules_learned := public.fn_learn_from_approval(p_inbox_id, p_payload, v_supplier_id);
    v_result := v_result || jsonb_build_object('rules_learned', v_rules_learned);
  END IF;

  -- 7. Append capex_assets count to result
  IF v_capex_count > 0 THEN
    v_result := v_result || jsonb_build_object('capex_assets_created', v_capex_count);
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_approve_receipt_with_learning(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_approve_receipt_with_learning(jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_approve_receipt(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_receipt(jsonb) TO service_role;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('456_receipt_approval_owner_manager_only.sql', 'claude-opus-session-6d690fa1', 'success',
        'Receipt approval closed to anonymous and non-manager callers: new fn_assert_receipt_approver() '
     || '(owner/task_manager staff, service_role, direct DB sessions) is the first statement of '
     || 'fn_approve_receipt_with_learning; EXECUTE revoked from PUBLIC/anon on it, and from '
     || 'PUBLIC/anon/authenticated on the base fn_approve_receipt (callers: the definer functions '
     || 'fn_approve_receipt_with_learning + fn_approve_po, and service_role). MC 49cc8776.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.fn_approve_receipt(jsonb) TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_approve_receipt_with_learning(jsonb, uuid) TO PUBLIC, anon;
-- -- restore the fn_approve_receipt_with_learning body without the PERFORM line
-- DROP FUNCTION IF EXISTS public.fn_assert_receipt_approver();
-- DELETE FROM public.migration_log WHERE filename='456_receipt_approval_owner_manager_only.sql';
-- COMMIT;
