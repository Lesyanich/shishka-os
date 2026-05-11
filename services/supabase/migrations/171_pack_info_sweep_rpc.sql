-- ============================================================
-- Migration 171: Pack-Info Resolver Phase 3 — sweep candidate RPC
--
-- Adds pack_info_sweep_candidates(p_limit int) RPC used by the
-- nightly batch sweep (services/mcp-finance/src/jobs/pack-info-sweep.ts).
--
-- Returns nomenclature rows with suspicious base_unit AND at least one
-- purchase_logs entry AND no skip-decision within the last 7 days,
-- joined with the most-recent purchase line's supplier_id / barcode /
-- price_per_unit so the resolver gets the context it needs.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, self-register ON CONFLICT.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pack_info_sweep_candidates(p_limit int DEFAULT 100)
RETURNS TABLE (
  nomenclature_id        uuid,
  base_unit              text,
  cost_per_unit          numeric,
  name                   text,
  recent_supplier_id     uuid,
  recent_barcode         text,
  recent_price_per_unit  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id              AS nomenclature_id,
    n.base_unit       AS base_unit,
    n.cost_per_unit   AS cost_per_unit,
    n.name            AS name,
    p.supplier_id     AS recent_supplier_id,
    p.barcode         AS recent_barcode,
    p.price_per_unit  AS recent_price_per_unit
  FROM public.nomenclature n
  CROSS JOIN LATERAL (
    SELECT pl.supplier_id, pl.barcode, pl.price_per_unit
    FROM public.purchase_logs pl
    WHERE pl.nomenclature_id = n.id
    ORDER BY pl.invoice_date DESC NULLS LAST, pl.created_at DESC
    LIMIT 1
  ) p
  WHERE n.is_deleted = false
    AND n.base_unit = ANY(ARRAY['pcs','bag','bottle','pack'])
    AND NOT EXISTS (
      SELECT 1 FROM public.data_health_decisions d
      WHERE d.entity_id  = n.id
        AND d.field      = 'base_unit'
        AND d.status     = 'skip'
        AND d.decided_at > now() - interval '7 days'
    )
  ORDER BY n.id
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.pack_info_sweep_candidates(int) IS
  'Phase 3 sweep candidate fetch. Returns nomenclature rows with suspicious base_unit and >=1 purchase, joined with most-recent purchase line. 7-day cooldown on skip-decisions. SECURITY DEFINER for service role.';

-- Service role only. SECURITY DEFINER bypasses purchase_logs RLS to surface
-- recent_price_per_unit (procurement-sensitive); granting authenticated would
-- expose this to every logged-in user via PostgREST. If a future UI needs
-- this data interactively, add the grant in a follow-up migration paired
-- with an explicit role check inside the function or a non-DEFINER wrapper.
REVOKE ALL ON FUNCTION public.pack_info_sweep_candidates(int) FROM PUBLIC;
-- Defensive: REVOKE from authenticated in case a previous apply granted it
-- (this migration shipped with that grant briefly during development). REVOKE
-- on a role with no grant is a no-op, so this is safe to keep permanently.
REVOKE EXECUTE ON FUNCTION public.pack_info_sweep_candidates(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pack_info_sweep_candidates(int) TO service_role;

-- migration_log self-register
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '171_pack_info_sweep_rpc.sql',
  'claude-opus-session-28851866',
  'Pack-Info Resolver Phase 3 sweep RPC. Spec: 2026-05-08-pack-info-resolver-design.md. MC task: 25523c4f.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
