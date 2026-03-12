-- ════════════════════════════════════════════════════════════
-- Migration 028: RLS SELECT policies for fin_categories & fin_sub_categories
-- Date: 2026-03-10
-- ════════════════════════════════════════════════════════════
-- Root cause: RLS was enabled on these tables but NO policies existed,
-- so all frontend queries returned empty arrays → Category/SubCategory
-- columns and dropdowns appeared empty.
-- Fix: Allow public read access (reference data, no sensitive info).
-- ════════════════════════════════════════════════════════════

CREATE POLICY "fin_categories_select" ON fin_categories
  FOR SELECT USING (true);

CREATE POLICY "fin_sub_categories_select" ON fin_sub_categories
  FOR SELECT USING (true);
