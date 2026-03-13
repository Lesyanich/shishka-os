-- ═══════════════════════════════════════════════════════════════
-- Migration 053: Security Preparation (Phase 8 Foundation)
-- Phase 7.1: DB Architecture Audit — Issue #5 (RLS Security)
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: Admin panel uses anon key → expense_ledger, nomenclature,
--          inventory data is 100% readable by the public internet.
--          Anyone can extract anon key from browser and query the API.
--
-- THIS MIGRATION: Non-destructive. Creates helper functions and
--                 documents the Phase 8 RLS migration plan.
--                 Does NOT change existing RLS policies.
--
-- PHASE 8 WILL: Enable Supabase Auth, update RLS to 'authenticated',
--               add login UI, set persistSession: true.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Helper: auth gating function ───

CREATE OR REPLACE FUNCTION public.fn_is_authenticated()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Phase 8 will change this to:
  --   RETURN auth.role() = 'authenticated';
  -- For now, allow all access (matches current anon-key behavior)
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.fn_is_authenticated()
  IS 'Phase 8 prep: auth gating function. Currently returns true (open access). Will be updated to check auth.role() = authenticated when Supabase Auth is deployed.';

-- ─── 2. Helper: current user ID ───

CREATE OR REPLACE FUNCTION public.fn_current_user_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Phase 8 will change this to:
  --   RETURN auth.uid();
  -- For now return NULL (no auth)
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_current_user_id()
  IS 'Phase 8 prep: returns current user UUID. Currently NULL (no auth). Will return auth.uid() when Supabase Auth is deployed.';

-- ═══════════════════════════════════════════════════════════════
-- PHASE 8 RLS MIGRATION PLAN (documented for future implementation)
-- ═══════════════════════════════════════════════════════════════
--
-- ── Step 1: Enable Supabase Auth ──
--   - Enable email/password provider in Supabase Dashboard
--   - Create initial manager accounts (CEO, admin, kitchen manager)
--   - Optional: enable Google OAuth for team
--
-- ── Step 2: Update helper functions ──
--   ALTER fn_is_authenticated():  RETURN auth.role() = 'authenticated';
--   ALTER fn_current_user_id():   RETURN auth.uid();
--
-- ── Step 3: Replace ALL RLS policies ──
--   For each table, drop USING(true) policies and create new ones:
--
--   Tables requiring RLS update (current policy → target):
--
--   | Table                    | Current Access    | Target Access     |
--   |--------------------------|-------------------|-------------------|
--   | nomenclature             | anon CRUD         | authenticated CRUD|
--   | bom_structures           | anon CRUD         | authenticated CRUD|
--   | expense_ledger           | public SELECT     | authenticated CRUD|
--   | suppliers                | public SELECT     | authenticated CRUD|
--   | purchase_logs            | public SELECT     | authenticated RO  |
--   | inventory_balances       | anon+auth ALL     | authenticated ALL |
--   | waste_logs               | anon+auth ALL     | authenticated ALL |
--   | inventory_batches        | anon+auth ALL     | authenticated ALL |
--   | stock_transfers          | anon+auth INSERT  | authenticated INS |
--   | orders                   | authenticated     | keep              |
--   | order_items              | authenticated     | keep              |
--   | production_tasks         | needs RLS review  | authenticated CRUD|
--   | production_plans         | anon+auth CRUD    | authenticated CRUD|
--   | plan_targets             | anon+auth CRUD    | authenticated CRUD|
--   | supplier_catalog         | public SELECT+INS | authenticated CRUD|
--   | production_task_outputs  | public SELECT+INS | authenticated CRUD|
--   | receipt_jobs             | public SELECT+INS | authenticated CRUD|
--   | product_categories       | public SELECT     | authenticated RO  |
--   | brands                   | public SELECT     | authenticated RO  |
--   | tags                     | public SELECT     | authenticated RO  |
--   | nomenclature_tags        | public CRUD       | authenticated CRUD|
--   | fin_categories           | public SELECT     | authenticated RO  |
--   | fin_sub_categories       | public SELECT     | authenticated RO  |
--   | recipes_flow             | if exists         | authenticated RO  |
--   | daily_plan               | if exists         | authenticated RO  |
--
-- ── Step 4: Update Supabase client ──
--   File: 03_Development/admin-panel/src/lib/supabase.ts
--     - Set persistSession: true
--     - Add AuthProvider wrapper
--
-- ── Step 5: Create login UI ──
--   File: 03_Development/admin-panel/src/pages/LoginPage.tsx
--     - Email + password form
--     - Redirect to / on success
--
-- ── Step 6: Add route guards ──
--   File: 03_Development/admin-panel/src/App.tsx
--     - Wrap routes in AuthGuard component
--     - Redirect unauthenticated users to /login
--
-- ── Step 7: Update fn_approve_receipt ──
--   Add: created_by = fn_current_user_id() on expense_ledger INSERT
--
-- ═══════════════════════════════════════════════════════════════
