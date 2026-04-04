-- ════════════════════════════════════════════════════════════════════
-- Migration 031: Security Audit — Column-Level Privilege Hardening
-- Date: 2026-03-10
-- ════════════════════════════════════════════════════════════════════
-- THREAT: Mass Assignment via Supabase REST API (PostgREST)
--
-- When RLS allows UPDATE on a row, the REST API client can PATCH any
-- column — including trigger-managed costs, RPC-managed statuses, and
-- immutable audit fields. A malicious client with the anon key can
-- manipulate business-critical data.
--
-- FIX: PostgreSQL column-level REVOKE. This blocks specific columns
-- from being updated via REST API (anon/authenticated roles), while
-- SECURITY DEFINER RPCs and triggers continue to work (they run as
-- the function owner, which retains full privileges).
-- ════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- CATEGORY A: Trigger/RPC-Managed Columns
-- These columns are set ONLY by server-side logic. Direct client
-- writes would corrupt business data.
-- ═══════════════════════════════════════════════════════════════════

-- A1. nomenclature.cost_per_unit
-- Managed by: fn_update_cost_on_purchase() trigger (migration 021)
-- Risk: Direct UPDATE would decouple cost from actual purchase prices,
--   breaking margin calculations, MRP cost estimates, and procurement
-- Fix: REVOKE UPDATE — trigger runs as SECURITY DEFINER (bypasses)
REVOKE UPDATE (cost_per_unit) ON nomenclature FROM anon, authenticated;

-- A2. inventory_batches.barcode
-- Managed by: fn_generate_barcode() at INSERT (migration 018)
-- Risk: Changing barcode would break label↔batch linkage, stock scans
-- Fix: REVOKE UPDATE — barcode is immutable after creation
REVOKE UPDATE (barcode) ON inventory_batches FROM anon, authenticated;

-- A3. inventory_batches.production_task_id
-- Managed by: fn_create_batches_from_task() at INSERT (migration 018)
-- Risk: Reassigning batch to different task corrupts production audit trail
-- Fix: REVOKE UPDATE — production link is immutable
REVOKE UPDATE (production_task_id) ON inventory_batches FROM anon, authenticated;

-- A4. production_plans.mrp_result
-- Managed by: fn_run_mrp() RPC (migration 023)
-- Risk: Injecting fake MRP results would corrupt procurement recommendations
-- Fix: REVOKE UPDATE — only fn_run_mrp (SECURITY DEFINER) should write
REVOKE UPDATE (mrp_result) ON production_plans FROM anon, authenticated;

-- A5. capex_transactions.transaction_id
-- Managed by: fn_approve_receipt() generates 'RCV-<uuid>' at INSERT (migration 030)
-- Risk: Changing unique identifier could cause duplicates or lose audit trail
-- Fix: REVOKE UPDATE — transaction_id is immutable
REVOKE UPDATE (transaction_id) ON capex_transactions FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- CATEGORY B: Financial Integrity Fields
-- Set at creation, should not be altered after the fact.
-- ═══════════════════════════════════════════════════════════════════

-- B1. orders.total_amount
-- Set at: Order creation (insert), computed from order_items
-- Risk: Changing total_amount after creation creates financial discrepancy
-- Note: orders.status is NOT revoked — LiveOrderBoard.tsx does direct
--   .update({ status }) for the Kanban workflow
REVOKE UPDATE (total_amount) ON orders FROM anon, authenticated;

-- B2. capex_transactions.amount_thb
-- Set at: fn_approve_receipt() or direct insert
-- Risk: Altering historical financial amounts corrupts accounting records
REVOKE UPDATE (amount_thb) ON capex_transactions FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- CATEGORY C: Immutable Audit Trail
-- These tables should be INSERT-only. No row should ever be modified
-- after creation — corrections should be new entries.
-- ═══════════════════════════════════════════════════════════════════

-- C1. stock_transfers — movement audit log
-- Risk: Editing from/to locations or batch_id rewrites logistics history
-- Note: REVOKE UPDATE on entire table (not per-column)
REVOKE UPDATE ON stock_transfers FROM anon, authenticated;

-- C2. waste_logs.quantity + waste_logs.financial_liability
-- Risk: Reducing waste quantity hides spoilage; changing liability shifts
--   financial blame (e.g., from employee to cafe after investigation)
-- Note: waste_logs.comment and waste_logs.reason left updatable for corrections
REVOKE UPDATE (quantity, financial_liability) ON waste_logs FROM anon, authenticated;

-- C3. purchase_logs — purchase audit trail
-- Note: purchase_logs has NO UPDATE RLS policy (only SELECT + INSERT) —
--   already safe at the RLS level. Adding column REVOKE as defense-in-depth.
REVOKE UPDATE ON purchase_logs FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after applying migration)
-- ═══════════════════════════════════════════════════════════════════
-- Check column privileges:
--   SELECT table_name, column_name, privilege_type, grantee
--   FROM information_schema.column_privileges
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated')
--     AND privilege_type = 'UPDATE'
--   ORDER BY table_name, column_name;
--
-- Test that protected column rejects update:
--   SET ROLE anon;
--   UPDATE nomenclature SET cost_per_unit = 0 WHERE id = '...'::UUID;
--   -- Expected: ERROR: permission denied for table nomenclature
--   RESET ROLE;
--
-- Test that trigger still works:
--   INSERT INTO purchase_logs (nomenclature_id, supplier_id, quantity, price_per_unit, total_price)
--   VALUES ('...', '...', 1, 99.99, 99.99);
--   -- Expected: nomenclature.cost_per_unit updated to 99.99 (trigger runs as SECURITY DEFINER)
