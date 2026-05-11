-- ============================================================
-- Migration 172: Pack-Info Resolver Phase 4 — owner approval RPC
--
-- Spec:  docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md
-- Plan:  docs/superpowers/plans/2026-05-12-pack-info-resolver-phase4.md
-- MC:    91cbaab2-60b8-4bc6-a6c5-414732c24f3a (Phase 4)
-- Predecessor migration: 170 (schema), 171 (sweep RPC)
--
-- Adds:
--   1. fn_is_owner() helper — reads staff.app_role for current auth.uid()
--   2. fn_approve_pack_decision(decision_id, action) SECURITY DEFINER RPC
--      Atomically applies or rejects a pending pack-info decision.
--      Routes writes to nomenclature based on the decision.field.
--
-- Deliberately skips: explicit UPDATE policy on data_health_decisions.
-- The existing mig 154 RLS already blocks authenticated UPDATEs; the RPC
-- below is the only sanctioned write path, which forces all owner approvals
-- through input validation + status guard. Direct .from(...).update() from
-- frontend would skip that validation.
-- ============================================================

BEGIN;

-- ── 1. Helper: is the current user an active owner? ─────────────────

CREATE OR REPLACE FUNCTION public.fn_is_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff
    WHERE auth_user_id = auth.uid()
      AND app_role = 'owner'
      AND is_active = true
  );
$$;

COMMENT ON FUNCTION public.fn_is_owner() IS
  'Returns true if the current JWT identifies an active staff member with app_role=owner. SECURITY DEFINER so it sees staff regardless of caller RLS.';

GRANT EXECUTE ON FUNCTION public.fn_is_owner() TO authenticated;

-- ── 2. Approval RPC: apply or reject a pending pack-info decision ───

CREATE OR REPLACE FUNCTION public.fn_approve_pack_decision(
  p_decision_id UUID,
  p_action TEXT
)
RETURNS public.data_health_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision  public.data_health_decisions;
  v_rule_code TEXT;
  v_staff_id  UUID;
  v_decided_by TEXT;
BEGIN
  -- Authn: only an owner may proceed
  IF NOT public.fn_is_owner() THEN
    RAISE EXCEPTION 'permission denied: owner role required'
      USING ERRCODE = '42501';
  END IF;

  -- Validate action
  IF p_action NOT IN ('apply', 'reject') THEN
    RAISE EXCEPTION 'invalid action %, expected apply|reject', p_action
      USING ERRCODE = '22023';
  END IF;

  -- Lock and load the decision row
  SELECT * INTO v_decision
  FROM public.data_health_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is not pending (status=%)',
      p_decision_id, v_decision.status
      USING ERRCODE = '22023';
  END IF;

  -- Pull rule_code for routed apply logic
  SELECT rule_code INTO v_rule_code
  FROM public.data_health_rules
  WHERE id = v_decision.rule_id;

  -- Audit identity: prefer staff.name, fall back to auth.uid text
  SELECT id INTO v_staff_id
  FROM public.staff
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
  v_decided_by := COALESCE(v_staff_id::TEXT, auth.uid()::TEXT, 'unknown-owner');

  IF p_action = 'reject' THEN
    UPDATE public.data_health_decisions
    SET status = 'rejected',
        decided_by = v_decided_by
    WHERE id = p_decision_id;

  ELSIF p_action = 'apply' THEN
    -- Only NOMENCLATURE_AUTO_PACK_FILL is supported here; future rules can
    -- extend this branch. Unknown rule => still mark applied (audit only),
    -- but don't touch any other table.
    IF v_rule_code = 'NOMENCLATURE_AUTO_PACK_FILL'
       AND v_decision.entity_kind = 'nomenclature' THEN

      IF v_decision.field = 'base_unit' THEN
        UPDATE public.nomenclature
        SET base_unit = v_decision.new_value,
            updated_at = now()
        WHERE id = v_decision.entity_id;

      ELSIF v_decision.field = 'cost_per_unit' THEN
        -- new_value is text-serialized numeric (per Phase 2 writer)
        UPDATE public.nomenclature
        SET cost_per_unit = v_decision.new_value::NUMERIC,
            updated_at = now()
        WHERE id = v_decision.entity_id;
      END IF;

      -- supplier_catalog package_* sync deliberately NOT done here:
      --   * Phase 2 auto-apply path already writes supplier_catalog inline
      --   * Phase 3 nightly sweep refreshes from current resolver state
      --   * Adding it here would require re-parsing source_payload JSON and
      --     duplicate the resolver's parsing logic in plpgsql
    END IF;

    -- Always mark the decision applied (even if rule didn't match a write
    -- path — the audit trail still records the human approval)
    UPDATE public.data_health_decisions
    SET status = 'applied',
        decided_by = v_decided_by
    WHERE id = p_decision_id;
  END IF;

  -- Return the post-update row
  SELECT * INTO v_decision
  FROM public.data_health_decisions
  WHERE id = p_decision_id;

  RETURN v_decision;
END;
$$;

COMMENT ON FUNCTION public.fn_approve_pack_decision(UUID, TEXT) IS
  'Owner-only approval RPC for Pack-Info Resolver pending decisions. Atomically applies new_value to the entity (currently nomenclature.base_unit | nomenclature.cost_per_unit) and updates the decision status. Phase 4 PR2.';

GRANT EXECUTE ON FUNCTION public.fn_approve_pack_decision(UUID, TEXT) TO authenticated;

-- ── 3. Self-register ────────────────────────────────────────────────

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '172_pack_info_owner_approval.sql',
  'claude-opus-session-9e74930c',
  'Pack-Info Resolver Phase 4 PR2: fn_is_owner() + fn_approve_pack_decision RPC. MC 91cbaab2 (umbrella e8df7bc4).'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
