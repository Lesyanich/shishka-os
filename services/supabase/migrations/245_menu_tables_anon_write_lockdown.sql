-- Migration 245: Lock down anon WRITE access on menu/catalog tables
-- MC Task: (pending — owner to assign)
-- Date: 2026-06-06
-- Status: NEEDS MANUAL REVIEW + APPLY
--
-- THREAT
-- ------
-- Migration 014 granted `FOR ALL TO public USING(true) WITH CHECK(true)` on
-- nomenclature + bom_structures, and migration 045 did the same shape on
-- product_categories / tags / nomenclature_tags. After the repo went public
-- (see mig 109), the anon key is internet-discoverable, so ANY visitor can
-- INSERT / UPDATE / DELETE the entire menu and BOM cost structure.
--
-- FIX
-- ---
-- Keep PUBLIC READ (the customer site + admin reads need it — zero breakage)
-- but restrict INSERT/UPDATE/DELETE to authenticated sessions.
--
-- WHY A DIRECT auth.role() CHECK (not fn_is_authenticated())
-- ----------------------------------------------------------
-- public.fn_is_authenticated() still hardcodes `RETURN true` (defined in
-- mig 053, never updated). Gating on it would be a no-op. We use a real
-- `(SELECT auth.role()) = 'authenticated'` check here instead.
--
-- SAFETY (verified against the codebase before writing this migration):
--   • Browser admin writes (useMenuData, useDishDetail) run under the logged-in
--     Supabase session  -> role = authenticated  -> allowed.
--   • Chef API (_writeTools.ts) uses supabaseForUser(jwt) -> authenticated -> allowed.
--   • Edge fn loyverse-sync uses SUPABASE_SERVICE_ROLE_KEY -> bypasses RLS -> unaffected.
--   • No code path relies on raw anon WRITES to these tables.
--
-- NOTE: this migration does NOT auto-apply. Review, then run via psql.
-- FOLLOW-UP (separate task, NOT here): fn_is_authenticated() == true makes
-- migration 109 and the whole auth-gating layer inert. Fixing it touches the
-- entire schema and must be tested on staging first.

BEGIN;

-- Helper: drop every existing policy on a table, then we recreate a clean,
-- canonical least-privilege set. Reference/menu tables only carried simple
-- permissive USING(true) policies, so a full reset is safe and idempotent.
DO $$
DECLARE
  tbl  text;
  pol  record;
  tables text[] := ARRAY[
    'nomenclature',
    'bom_structures',
    'product_categories',
    'tags',
    'nomenclature_tags'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

-- Canonical policy set per table:
--   *_public_read   : SELECT open to all (anon + authenticated) — customer site
--   *_auth_insert   : INSERT only for authenticated
--   *_auth_update   : UPDATE only for authenticated
--   *_auth_delete   : DELETE only for authenticated

-- ── nomenclature ─────────────────────────────────────────────
CREATE POLICY nomenclature_public_read ON public.nomenclature
  FOR SELECT TO public USING (true);
CREATE POLICY nomenclature_auth_insert ON public.nomenclature
  FOR INSERT TO public WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY nomenclature_auth_update ON public.nomenclature
  FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY nomenclature_auth_delete ON public.nomenclature
  FOR DELETE TO public USING ((SELECT auth.role()) = 'authenticated');

-- ── bom_structures ───────────────────────────────────────────
CREATE POLICY bom_structures_public_read ON public.bom_structures
  FOR SELECT TO public USING (true);
CREATE POLICY bom_structures_auth_insert ON public.bom_structures
  FOR INSERT TO public WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY bom_structures_auth_update ON public.bom_structures
  FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY bom_structures_auth_delete ON public.bom_structures
  FOR DELETE TO public USING ((SELECT auth.role()) = 'authenticated');

-- ── product_categories ───────────────────────────────────────
CREATE POLICY product_categories_public_read ON public.product_categories
  FOR SELECT TO public USING (true);
CREATE POLICY product_categories_auth_insert ON public.product_categories
  FOR INSERT TO public WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY product_categories_auth_update ON public.product_categories
  FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY product_categories_auth_delete ON public.product_categories
  FOR DELETE TO public USING ((SELECT auth.role()) = 'authenticated');

-- ── tags ─────────────────────────────────────────────────────
CREATE POLICY tags_public_read ON public.tags
  FOR SELECT TO public USING (true);
CREATE POLICY tags_auth_insert ON public.tags
  FOR INSERT TO public WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY tags_auth_update ON public.tags
  FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY tags_auth_delete ON public.tags
  FOR DELETE TO public USING ((SELECT auth.role()) = 'authenticated');

-- ── nomenclature_tags ────────────────────────────────────────
CREATE POLICY nomenclature_tags_public_read ON public.nomenclature_tags
  FOR SELECT TO public USING (true);
CREATE POLICY nomenclature_tags_auth_insert ON public.nomenclature_tags
  FOR INSERT TO public WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY nomenclature_tags_auth_update ON public.nomenclature_tags
  FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');
CREATE POLICY nomenclature_tags_auth_delete ON public.nomenclature_tags
  FOR DELETE TO public USING ((SELECT auth.role()) = 'authenticated');

-- Note: column-level REVOKE UPDATE(cost_per_unit) from mig 031 is independent
-- of RLS and still applies — cost_per_unit stays trigger-managed.

-- ============================================================
-- Self-register in migration_log (RULE-MIGRATION-TRACKING)
-- ============================================================
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '245_menu_tables_anon_write_lockdown.sql',
  'Close anon INSERT/UPDATE/DELETE on nomenclature, bom_structures, product_categories, tags, nomenclature_tags; keep public SELECT. Writes now require auth.role()=authenticated (real check, not the no-op fn_is_authenticated()).',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
