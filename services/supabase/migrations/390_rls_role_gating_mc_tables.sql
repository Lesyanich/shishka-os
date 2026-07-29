-- Migration 390: RLS role gating for the 6 "critical" MC/ops tables
-- MC Task: a456cc85 (Phase 4.1) · Epic: 2a8b06a4
-- Date: 2026-07-29
-- Audit: this file's header + docs/security/rls-audit-report.md
--
-- ⚠ STATUS: PREPARED — NOT APPLIED. Apply is CEO-gated (Phase 4.1).
--   Verify with the queries at the bottom AFTER applying; this file does not
--   self-register — check pg_policies, not the migration ledger
--   (migration_log and schema_migrations drift — see the DB gotchas note).
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────
-- These 6 tables were labelled CRITICAL on the assumption that anon could
-- reach them. It cannot. Every one already has RLS enabled and a single
-- policy gated on fn_is_authenticated() (= auth.role() = 'authenticated'),
-- so the anon key is refused. Verified live 2026-07-29.
--
-- ── THE ACTUAL GAP ──────────────────────────────────────────────────
-- The existing *_auth_full policies grant ALL to ANY authenticated user.
-- The frontend already implements a 3-tier model (owner ⊃ task_manager ⊃
-- cook, apps/admin-panel/src/lib/roles.ts) and gates routes with RoleGuard,
-- but the database does not enforce it: a cook's session can read and write
-- every task, sprint and receipt via the REST API directly. This migration
-- mirrors the frontend's OWN route tiers into the database. It invents no
-- new policy — each rule below cites the route that already implies it.
--
-- ── BLAST RADIUS ────────────────────────────────────────────────────
-- The MCP servers (chef / finance / mission-control) connect with
-- service_role, which BYPASSES RLS entirely. Nothing here can affect agent
-- sessions or Mission Control automation. Only browser sessions using the
-- anon key + a Supabase Auth login are affected.
-- Live accounts at time of writing: 2 owner, 1 task_manager (Mint), 3 cook.
--
-- ── DELIBERATELY OUT OF SCOPE ───────────────────────────────────────
-- 1. Table-level grants. anon still holds SELECT/UPDATE/DELETE grants on
--    these tables; RLS overrides them, so this is belt-and-braces, not a
--    hole. REVOKE is a separate, wider change (it can break the Telegram
--    WebApp paths) and belongs in its own migration.
-- 2. cook_feedback_anon_insert — the existing anon INSERT policy is LEFT
--    IN PLACE. It backs the TWA submit path. Same principle as migration
--    326: touch no read/submit path the floor depends on.

BEGIN;

-- ============================================================
-- Helper: role check against the staff table.
-- SECURITY DEFINER because RLS on `staff` would otherwise make this
-- recursive. search_path pinned so the definer context cannot be
-- redirected to an attacker-controlled schema.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_has_app_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff
    WHERE auth_user_id = auth.uid()
      AND is_active
      AND app_role = ANY(p_roles)
  );
$function$;

COMMENT ON FUNCTION public.fn_has_app_role(text[]) IS
  'True if the calling Supabase Auth user maps to an active staff row whose app_role is in p_roles. Mirrors apps/admin-panel/src/lib/roles.ts. Used by RLS policies.';

REVOKE ALL ON FUNCTION public.fn_has_app_role(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_app_role(text[]) TO authenticated;

-- ============================================================
-- TIER: owner only
-- Route evidence: /mission is RoleGuard minRole="owner" (App.tsx).
-- business_initiatives / sprints / task_comments have ZERO frontend
-- references at all — they are written only by the MCP servers under
-- service_role, so owner-only costs no user-facing behaviour.
-- ============================================================
DROP POLICY IF EXISTS business_tasks_auth_full ON public.business_tasks;
CREATE POLICY business_tasks_owner_full ON public.business_tasks
  FOR ALL TO authenticated
  USING      (public.fn_has_app_role(ARRAY['owner']))
  WITH CHECK (public.fn_has_app_role(ARRAY['owner']));

DROP POLICY IF EXISTS business_initiatives_auth_full ON public.business_initiatives;
CREATE POLICY business_initiatives_owner_full ON public.business_initiatives
  FOR ALL TO authenticated
  USING      (public.fn_has_app_role(ARRAY['owner']))
  WITH CHECK (public.fn_has_app_role(ARRAY['owner']));

DROP POLICY IF EXISTS sprints_auth_full ON public.sprints;
CREATE POLICY sprints_owner_full ON public.sprints
  FOR ALL TO authenticated
  USING      (public.fn_has_app_role(ARRAY['owner']))
  WITH CHECK (public.fn_has_app_role(ARRAY['owner']));

DROP POLICY IF EXISTS task_comments_auth_full ON public.task_comments;
CREATE POLICY task_comments_owner_full ON public.task_comments
  FOR ALL TO authenticated
  USING      (public.fn_has_app_role(ARRAY['owner']))
  WITH CHECK (public.fn_has_app_role(ARRAY['owner']));

-- ============================================================
-- TIER: task_manager (Mint) + owner
-- Route evidence: /receipts and /receive are RoleGuard
-- minRole="task_manager" — Mint uploads receipts and verifies OCR.
-- Full finance views stay owner-only and are not touched here.
-- ============================================================
DROP POLICY IF EXISTS receipt_inbox_auth_full ON public.receipt_inbox;
CREATE POLICY receipt_inbox_mgr_full ON public.receipt_inbox
  FOR ALL TO authenticated
  USING      (public.fn_has_app_role(ARRAY['owner','task_manager']))
  WITH CHECK (public.fn_has_app_role(ARRAY['owner','task_manager']));

-- ============================================================
-- cook_feedback — split, because the write is a floor action and the
-- review is a manager action.
--   INSERT: any staff tier. FeedbackFAB renders on /kitchen/my-tasks,
--           which is RoleGuard minRole="cook".
--   SELECT/UPDATE/DELETE: owner + task_manager (triage: is_processed).
-- ============================================================
DROP POLICY IF EXISTS cook_feedback_auth_full ON public.cook_feedback;

CREATE POLICY cook_feedback_staff_insert ON public.cook_feedback
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_has_app_role(ARRAY['owner','task_manager','cook']));

CREATE POLICY cook_feedback_mgr_read ON public.cook_feedback
  FOR SELECT TO authenticated
  USING (public.fn_has_app_role(ARRAY['owner','task_manager']));

CREATE POLICY cook_feedback_mgr_update ON public.cook_feedback
  FOR UPDATE TO authenticated
  USING      (public.fn_has_app_role(ARRAY['owner','task_manager']))
  WITH CHECK (public.fn_has_app_role(ARRAY['owner','task_manager']));

CREATE POLICY cook_feedback_mgr_delete ON public.cook_feedback
  FOR DELETE TO authenticated
  USING (public.fn_has_app_role(ARRAY['owner','task_manager']));

-- ============================================================
-- Self-register in migration_log (RULE-MIGRATION-TRACKING).
-- Runs only when this migration is actually executed — the file being
-- committed does NOT put a row here. Same pattern as 326.
-- ============================================================
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '390_rls_role_gating_mc_tables.sql',
  'claude-opus-session-c1b887fb',
  'success',
  'Phase 4.1 (MC a456cc85): replace *_auth_full ALL-to-any-authenticated policies on business_tasks/business_initiatives/sprints/task_comments (owner), receipt_inbox (owner+task_manager) and cook_feedback (cook INSERT, mgr read/update/delete) with role-gated policies via new fn_has_app_role(). Mirrors the frontend RoleGuard tiers. Tables were never anon-exposed; the gap was between authenticated tiers. service_role unaffected.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFY AFTER APPLY (run manually — the ledger is not proof)
-- ============================================================
-- 1. Policies are in place and no *_auth_full survives:
--
--    SELECT tablename, policyname, roles::text, cmd, qual
--    FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('business_tasks','business_initiatives','receipt_inbox',
--                        'sprints','task_comments','cook_feedback')
--    ORDER BY tablename, cmd;
--
--    Expect: zero rows named '%_auth_full'; every new policy TO {authenticated}.
--
-- 2. The role helper answers correctly for a known user:
--
--    SELECT app_role, public.fn_has_app_role(ARRAY[app_role]) AS self_check
--    FROM staff WHERE is_active AND auth_user_id IS NOT NULL;
--
--    Expect: self_check = true for every row.
--
-- 3. MC smoke test (required by task a456cc85 — run BEFORE and AFTER):
--    - list_tasks via the mission-control MCP  -> must return rows
--    - update_task on a scratch task           -> must succeed
--    Both run under service_role, so both must be unaffected. If either
--    breaks, the cause is NOT this migration — service_role bypasses RLS.
--
-- 4. Browser smoke test, one session per tier:
--    - owner        -> /mission loads tasks, edit saves
--    - task_manager -> /receipts loads inbox, OCR verify saves;
--                      /mission redirects to /staff-tasks (unchanged, UI-level)
--    - cook         -> /kitchen/my-tasks loads; FeedbackFAB submit succeeds
--
-- ROLLBACK: restore the previous single policy per table, e.g.
--    DROP POLICY business_tasks_owner_full ON public.business_tasks;
--    CREATE POLICY business_tasks_auth_full ON public.business_tasks
--      FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());
--    ...repeated per table; then DROP FUNCTION public.fn_has_app_role(text[]);
