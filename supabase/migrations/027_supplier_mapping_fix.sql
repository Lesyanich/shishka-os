-- ════════════════════════════════════════════════════════════
-- Migration 027: Supplier Mapping Fix
-- Phase 4.3c — Map supplier_id for water utility rows
-- Date: 2026-03-10
-- ════════════════════════════════════════════════════════════
-- Maps 2 water rows to การประปาส่วนภูมิภาคสาขาภูเก็ต (Provincial Waterworks Authority, Phuket)
-- Remaining 3 rows (Electricity, General cleaning, Kitchen AC) have #N/A in CSV — no supplier.
-- ════════════════════════════════════════════════════════════

UPDATE expense_ledger
SET supplier_id = (SELECT id FROM suppliers WHERE name = 'การประปาส่วนภูมิภาคสาขาภูเก็ต' LIMIT 1)
WHERE details IN ('Water meter installation', 'Water supply (Dec 2025)')
  AND supplier_id IS NULL;
