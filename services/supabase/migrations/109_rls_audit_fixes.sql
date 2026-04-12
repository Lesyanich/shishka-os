-- Migration 109: RLS audit fixes — close anon-key attack surface
-- MC Task: 287f3cee
-- Date: 2026-04-12
-- Status: NEEDS MANUAL REVIEW + APPLY
--
-- Fixes 6 critical gaps and 2 high-severity gaps found in the RLS audit
-- after repository went public (anon key now internet-discoverable).
--
-- IMPORTANT: This migration does NOT auto-apply. Run manually via psql
-- after reviewing each change.

BEGIN;

-- ============================================================
-- CRITICAL FIX 1: business_tasks — RLS was DISABLED
-- The app.is_admin policy already exists but was ignored.
-- ============================================================
ALTER TABLE public.business_tasks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CRITICAL FIX 2: business_initiatives — RLS was DISABLED
-- Same pattern as business_tasks.
-- ============================================================
ALTER TABLE public.business_initiatives ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CRITICAL FIX 3: receipt_inbox — public CRUD with USING(true)
-- Drop duplicate and overly permissive policies, replace with
-- fn_is_authenticated() gating.
-- ============================================================

-- Drop all existing policies (7 total, including 3 duplicate pairs)
DROP POLICY IF EXISTS "inbox_select" ON public.receipt_inbox;
DROP POLICY IF EXISTS "inbox_insert" ON public.receipt_inbox;
DROP POLICY IF EXISTS "inbox_update" ON public.receipt_inbox;
DROP POLICY IF EXISTS "inbox_delete" ON public.receipt_inbox;
DROP POLICY IF EXISTS "receipt_inbox_read" ON public.receipt_inbox;
DROP POLICY IF EXISTS "receipt_inbox_insert" ON public.receipt_inbox;
DROP POLICY IF EXISTS "receipt_inbox_update" ON public.receipt_inbox;

-- Recreate with fn_is_authenticated()
CREATE POLICY "receipt_inbox_auth_full"
  ON public.receipt_inbox FOR ALL
  TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ============================================================
-- CRITICAL FIX 4: sprints — public ALL with USING(true)
-- ============================================================
DROP POLICY IF EXISTS "admin_full" ON public.sprints;

CREATE POLICY "sprints_auth_full"
  ON public.sprints FOR ALL
  TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ============================================================
-- CRITICAL FIX 5: task_comments — public ALL with USING(true)
-- ============================================================
DROP POLICY IF EXISTS "admin_full" ON public.task_comments;

CREATE POLICY "task_comments_auth_full"
  ON public.task_comments FOR ALL
  TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ============================================================
-- CRITICAL FIX 6: cook_feedback — anon ALL with USING(true)
-- Keep anon INSERT (TWA cooks submit without Supabase auth).
-- Gate SELECT/UPDATE/DELETE behind fn_is_authenticated().
-- ============================================================
DROP POLICY IF EXISTS "cook_feedback_anon_all" ON public.cook_feedback;
DROP POLICY IF EXISTS "cook_feedback_auth_select" ON public.cook_feedback;

-- Anon can only INSERT (submit feedback)
CREATE POLICY "cook_feedback_anon_insert"
  ON public.cook_feedback FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated users get full access
CREATE POLICY "cook_feedback_auth_full"
  ON public.cook_feedback FOR ALL
  TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ============================================================
-- HIGH FIX 1: staff — anon SELECT leaks PII (names, tg IDs)
-- Gate behind fn_is_authenticated(). TWA uses service_role
-- via edge function, not direct anon access.
-- ============================================================
DROP POLICY IF EXISTS "staff_read_anon" ON public.staff;

-- Keep the auth write policy, add auth read
CREATE POLICY "staff_read_auth"
  ON public.staff FOR SELECT
  TO public
  USING (fn_is_authenticated());

-- ============================================================
-- HIGH FIX 2: recipes_flow — anon SELECT leaks recipe IP
-- ============================================================
DROP POLICY IF EXISTS "recipes_flow_anon_read" ON public.recipes_flow;
DROP POLICY IF EXISTS "recipes_flow_auth_full" ON public.recipes_flow;

CREATE POLICY "recipes_flow_auth_full"
  ON public.recipes_flow FOR ALL
  TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ============================================================
-- Self-register in migration_log (RULE-MIGRATION-TRACKING)
-- ============================================================
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '109_rls_audit_fixes.sql',
  'RLS audit fixes: enable RLS on business_tasks/initiatives, close anon CRUD on receipt_inbox/sprints/task_comments/cook_feedback, remove anon SELECT from staff/recipes_flow',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
