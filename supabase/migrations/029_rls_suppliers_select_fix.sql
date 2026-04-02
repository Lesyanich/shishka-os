-- ════════════════════════════════════════════════════════════
-- Migration 029: Fix suppliers SELECT policy (anon access)
-- Date: 2026-03-10
-- ════════════════════════════════════════════════════════════
-- Root cause: suppliers_select policy had roles = {authenticated},
-- but the admin-panel frontend uses the anon key.
-- Result: Supabase client returned 0 suppliers → Supplier column
-- showed "—" for every row, and the Supplier dropdown was empty.
-- Fix: Recreate with USING (true) so both anon + authenticated can SELECT.
-- ════════════════════════════════════════════════════════════

DROP POLICY "suppliers_select" ON suppliers;

CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (true);
