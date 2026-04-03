-- ============================================================
-- Migration 054: Supabase Auth + RLS Migration
-- Phase 8 — Switch from anon access to authenticated-only
-- ============================================================
-- CRITICAL: Apply ONLY after:
--   1. Frontend auth (LoginPage, AuthProvider) is deployed
--   2. Email auth provider enabled in Supabase Dashboard
--   3. At least one user created in Dashboard → Authentication → Users
-- ============================================================

-- ─── 1. Switch auth helper functions ───

CREATE OR REPLACE FUNCTION fn_is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.role() = 'authenticated';
$$;

CREATE OR REPLACE FUNCTION fn_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

-- ─── 2. Enable RLS on tables that don't have it yet ───

ALTER TABLE public.production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capex_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_sub_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plan ENABLE ROW LEVEL SECURITY;

-- ─── 3. Drop ALL existing permissive policies ───
-- Pattern: DROP IF EXISTS for safety (idempotent)

-- nomenclature (014)
DROP POLICY IF EXISTS admin_panel_nomenclature_full_access ON public.nomenclature;

-- bom_structures (014)
DROP POLICY IF EXISTS admin_panel_bom_structures_full_access ON public.bom_structures;

-- locations (018)
DROP POLICY IF EXISTS locations_anon_all ON public.locations;
DROP POLICY IF EXISTS locations_auth_select ON public.locations;

-- inventory_batches (018)
DROP POLICY IF EXISTS inventory_batches_anon_all ON public.inventory_batches;
DROP POLICY IF EXISTS inventory_batches_auth_select ON public.inventory_batches;

-- stock_transfers (018)
DROP POLICY IF EXISTS stock_transfers_anon_all ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_auth_select ON public.stock_transfers;

-- inventory_balances (017)
DROP POLICY IF EXISTS inventory_balances_anon_all ON public.inventory_balances;
DROP POLICY IF EXISTS inventory_balances_auth_select ON public.inventory_balances;

-- waste_logs (017)
DROP POLICY IF EXISTS waste_logs_anon_all ON public.waste_logs;
DROP POLICY IF EXISTS waste_logs_auth_select ON public.waste_logs;

-- orders (022)
DROP POLICY IF EXISTS orders_select ON public.orders;
DROP POLICY IF EXISTS orders_insert ON public.orders;
DROP POLICY IF EXISTS orders_update ON public.orders;

-- order_items (022)
DROP POLICY IF EXISTS order_items_select ON public.order_items;
DROP POLICY IF EXISTS order_items_insert ON public.order_items;

-- suppliers (021)
DROP POLICY IF EXISTS suppliers_select ON public.suppliers;
DROP POLICY IF EXISTS suppliers_insert ON public.suppliers;
DROP POLICY IF EXISTS suppliers_update ON public.suppliers;

-- purchase_logs (021)
DROP POLICY IF EXISTS purchase_logs_select ON public.purchase_logs;
DROP POLICY IF EXISTS purchase_logs_insert ON public.purchase_logs;

-- fin_categories (024)
DROP POLICY IF EXISTS fin_categories_select ON public.fin_categories;

-- fin_sub_categories (024)
DROP POLICY IF EXISTS fin_sub_categories_select ON public.fin_sub_categories;

-- expense_ledger (024)
DROP POLICY IF EXISTS expense_ledger_select ON public.expense_ledger;
DROP POLICY IF EXISTS expense_ledger_insert ON public.expense_ledger;
DROP POLICY IF EXISTS expense_ledger_update ON public.expense_ledger;
DROP POLICY IF EXISTS expense_ledger_delete ON public.expense_ledger;

-- capex_transactions (030)
DROP POLICY IF EXISTS capex_transactions_select ON public.capex_transactions;
DROP POLICY IF EXISTS capex_transactions_insert ON public.capex_transactions;
DROP POLICY IF EXISTS capex_transactions_update ON public.capex_transactions;

-- opex_items (030)
DROP POLICY IF EXISTS opex_items_select ON public.opex_items;
DROP POLICY IF EXISTS opex_items_insert ON public.opex_items;
DROP POLICY IF EXISTS opex_items_update ON public.opex_items;
DROP POLICY IF EXISTS opex_items_delete ON public.opex_items;

-- receipt_jobs (036)
DROP POLICY IF EXISTS receipt_jobs_select ON public.receipt_jobs;
DROP POLICY IF EXISTS receipt_jobs_insert ON public.receipt_jobs;

-- supplier_catalog (049)
DROP POLICY IF EXISTS sc_select ON public.supplier_catalog;
DROP POLICY IF EXISTS sc_insert ON public.supplier_catalog;
DROP POLICY IF EXISTS sc_update ON public.supplier_catalog;

-- product_categories (045)
DROP POLICY IF EXISTS pc_select ON public.product_categories;
DROP POLICY IF EXISTS pc_insert ON public.product_categories;
DROP POLICY IF EXISTS pc_update ON public.product_categories;

-- brands (045)
DROP POLICY IF EXISTS brands_select ON public.brands;
DROP POLICY IF EXISTS brands_insert ON public.brands;
DROP POLICY IF EXISTS brands_update ON public.brands;

-- tags (045)
DROP POLICY IF EXISTS tags_select ON public.tags;
DROP POLICY IF EXISTS tags_insert ON public.tags;
DROP POLICY IF EXISTS tags_update ON public.tags;

-- nomenclature_tags (045)
DROP POLICY IF EXISTS nt_select ON public.nomenclature_tags;
DROP POLICY IF EXISTS nt_insert ON public.nomenclature_tags;
DROP POLICY IF EXISTS nt_delete ON public.nomenclature_tags;

-- production_task_outputs (048)
DROP POLICY IF EXISTS pto_select ON public.production_task_outputs;
DROP POLICY IF EXISTS pto_insert ON public.production_task_outputs;
DROP POLICY IF EXISTS pto_update ON public.production_task_outputs;

-- production_plans (023)
DROP POLICY IF EXISTS production_plans_select ON public.production_plans;
DROP POLICY IF EXISTS production_plans_insert ON public.production_plans;
DROP POLICY IF EXISTS production_plans_update ON public.production_plans;
DROP POLICY IF EXISTS production_plans_delete ON public.production_plans;

-- plan_targets (023)
DROP POLICY IF EXISTS plan_targets_select ON public.plan_targets;
DROP POLICY IF EXISTS plan_targets_insert ON public.plan_targets;
DROP POLICY IF EXISTS plan_targets_update ON public.plan_targets;
DROP POLICY IF EXISTS plan_targets_delete ON public.plan_targets;

-- ─── 4. Create new authenticated-only policies ───
-- Single FOR ALL policy per table using fn_is_authenticated()

CREATE POLICY "auth_full_access" ON public.nomenclature
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.bom_structures
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.equipment
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.production_tasks
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.production_task_outputs
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.fin_categories
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.fin_sub_categories
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.capex_assets
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.capex_transactions
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.expense_ledger
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.suppliers
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.purchase_logs
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.opex_items
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.receipt_jobs
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.orders
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.order_items
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.production_plans
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.plan_targets
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.inventory_balances
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.waste_logs
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.locations
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.inventory_batches
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.stock_transfers
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.supplier_catalog
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.product_categories
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.brands
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.tags
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.nomenclature_tags
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.recipes_flow
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

CREATE POLICY "auth_full_access" ON public.daily_plan
  FOR ALL USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

-- ─── 5. Notes ───
-- SECURITY DEFINER functions (fn_approve_receipt, fn_run_mrp, fn_approve_plan,
-- fn_start_production_task, fn_create_batches_from_task, fn_process_new_order,
-- fn_predictive_procurement, fn_start_kitchen_task, fn_cleanup_stale_receipt_jobs)
-- bypass RLS by design — NO changes needed.
--
-- Storage policies (receipts bucket) remain as-is — they use auth.role() already.
--
-- Backward-compat VIEWs (supplier_item_mapping, supplier_products) inherit
-- RLS from the underlying supplier_catalog table.
