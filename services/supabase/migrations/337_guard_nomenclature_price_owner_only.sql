-- 337_guard_nomenclature_price_owner_only.sql
-- Column-level RLS CUTOVER — REAL enforcement (Phase 4.3) — MC c2a5d578
-- Spec: docs/security/column-rls-rpc-design-2026-06-29.md
--
-- WHY THIS EXISTS: migration 336's `REVOKE UPDATE (price)` was a NO-OP. nomenclature
-- holds a TABLE-level UPDATE grant to `authenticated`, and a column-level REVOKE cannot
-- carve a single column out of a table-wide grant — the table grant still covers price.
-- Combined with the permissive RLS policy `nomenclature_auth_update`
-- (USING/CHECK = auth.role() = 'authenticated'), ANY logged-in user (incl. a cook) could
-- still change a dish price directly. RLS itself can't express "may update the row but not
-- the price column" (a policy can't compare OLD vs NEW), so we enforce with a trigger.
--
-- expense_ledger needs NO equivalent: it is already owner-only for ALL commands via RLS
-- `expense_ledger_owner_only` (mig 313) — a non-owner can't update any of its columns.
--
-- BEHAVIOUR:
--   * cook / any non-owner authenticated user changing price  -> blocked (42501)
--   * owner changing price — directly OR via fn_set_dish_price (mig 334, which also
--     audits) — allowed (auth.uid()/fn_is_owner() persist through SECURITY DEFINER)
--   * service_role (edge functions / backend) and migrations -> bypass
--     (auth.role() is only 'authenticated' for a real logged-in app user)
--   * updates that don't touch price never fire the trigger (BEFORE UPDATE OF price)
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_guard_nomenclature_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price
     AND (SELECT auth.role()) = 'authenticated'
     AND NOT public.fn_is_owner()
  THEN
    RAISE EXCEPTION 'forbidden: only owner may change dish price (use fn_set_dish_price)'
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_nomenclature_price ON public.nomenclature;
CREATE TRIGGER trg_guard_nomenclature_price
  BEFORE UPDATE OF price ON public.nomenclature
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_nomenclature_price();

-- ============================================================
-- Self-register in migration_log (RULE-MIGRATION-TRACKING).
-- ============================================================
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '337_guard_nomenclature_price_owner_only.sql',
  'Phase 4.3 real enforcement: BEFORE UPDATE OF price trigger on nomenclature blocks price changes by non-owner authenticated users. Supersedes mig 336 column REVOKE (no-op vs table-level grant). expense_ledger already owner-only via RLS (mig 313). Owner path (incl. fn_set_dish_price) and service_role bypass.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
