-- Migration 326: RLS reconciliation fixes — anon write lockdown
-- MC Task: c36c3210 (Phase 3.1) · Epic: 2a8b06a4
-- Date: 2026-06-29
-- Supersedes the relevant parts of 109_rls_audit_fixes.sql (already applied).
-- Reconciliation: docs/security/rls-reconciliation-2026-06-29.md
--
-- ✅ STATUS: APPLIED. Header corrected 2026-07-29 — it still said "PREPARED —
--   NOT APPLIED" long after the fix had landed, which reads as an open task.
--   Confirmed against live pg_policies (not the ledger): recipe_feedback now
--   has anon INSERT-only + authenticated ALL + the anon/auth SELECT policy,
--   and production_log has no anon UPDATE. That is exactly this file's intent.
--
-- SCOPE (deliberately narrow = the safe subset):
--   Removes anon's ability to UPDATE/DELETE *arbitrary rows* on two tables where
--   the Telegram-WebApp only needs to INSERT (submit). This touches NO read path,
--   so the public menu and TWA cook screens are unaffected. The broader anon-read
--   gating (cost tables) is intentionally left OUT pending Phase 3.2 verification
--   of direct anon-key frontend queries — see the reconciliation doc §B.

BEGIN;

-- ============================================================
-- FIX 1: recipe_feedback — anon currently has ALL (USING true),
-- i.e. anon can UPDATE/DELETE *any* feedback row. Downgrade anon
-- to INSERT-only (submit), give authenticated full access.
-- The existing anon+auth SELECT policy (recipe_feedback_read) is
-- LEFT IN PLACE — TWA cooks still read feedback.
-- ============================================================
DROP POLICY IF EXISTS "recipe_feedback_write" ON public.recipe_feedback;

CREATE POLICY "recipe_feedback_anon_insert"
  ON public.recipe_feedback FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "recipe_feedback_auth_full"
  ON public.recipe_feedback FOR ALL
  TO authenticated
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- ============================================================
-- FIX 2: production_log — anon currently has UPDATE (USING true),
-- i.e. anon can mutate *any* production record. Remove anon UPDATE;
-- keep anon INSERT (prodlog_insert_anon) + anon SELECT
-- (prodlog_select_anon) for TWA logging/viewing. Add an authenticated
-- UPDATE path so the admin panel can still correct rows.
-- ⚠ Phase 3.2: confirm no TWA cook "edit production status" flow relies
--   on anon UPDATE before applying. If it does, route that through an
--   edge function (service_role) instead.
-- ============================================================
DROP POLICY IF EXISTS "prodlog_update_anon" ON public.production_log;

CREATE POLICY "prodlog_update_auth"
  ON public.production_log FOR UPDATE
  TO authenticated
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- ============================================================
-- Self-register in migration_log (RULE-MIGRATION-TRACKING).
-- Runs only when this migration is actually executed (Phase 4).
-- ============================================================
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '326_rls_reconciliation_fixes.sql',
  'RLS reconciliation (Phase 3.1): downgrade anon ALL->INSERT on recipe_feedback; remove anon UPDATE on production_log (add authenticated UPDATE). Read-gating of cost tables deferred to Phase 4.2 pending 3.2 verification.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
