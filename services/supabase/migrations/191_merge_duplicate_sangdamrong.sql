-- Migration 191: Merge duplicate Sangdamrong supplier records
-- Two UUIDs for the same real supplier:
--   8b1faecc-65e4-4b49-bee2-e4d0a5b88563 ("Sangdamrong Phuket", Apr 11, 1 expense)
--   668b3d36-b3f3-4a6a-81b0-133153bf1311 ("Sangdamrong Co., Ltd.", Apr 14+, 2 expenses)
-- Keep 668b3d36 as canonical (more recent, more records).

BEGIN;

-- Step 1: Reassign expense_ledger references
UPDATE public.expense_ledger
SET supplier_id = '668b3d36-b3f3-4a6a-81b0-133153bf1311'
WHERE supplier_id = '8b1faecc-65e4-4b49-bee2-e4d0a5b88563';

-- Step 2: Reassign purchase_logs references
UPDATE public.purchase_logs
SET supplier_id = '668b3d36-b3f3-4a6a-81b0-133153bf1311'
WHERE supplier_id = '8b1faecc-65e4-4b49-bee2-e4d0a5b88563';

-- Step 3: Reassign supplier_catalog references
UPDATE public.supplier_catalog
SET supplier_id = '668b3d36-b3f3-4a6a-81b0-133153bf1311'
WHERE supplier_id = '8b1faecc-65e4-4b49-bee2-e4d0a5b88563';

-- Step 4: Soft-delete the duplicate
UPDATE public.suppliers
SET is_deleted = true,
    name = name || ' [MERGED → 668b3d36]'
WHERE id = '8b1faecc-65e4-4b49-bee2-e4d0a5b88563';

-- Step 5: Ensure canonical record is active (was previously soft-deleted)
UPDATE public.suppliers
SET is_deleted = false
WHERE id = '668b3d36-b3f3-4a6a-81b0-133153bf1311';

-- Self-register
INSERT INTO public.migration_log (filename, applied_by, description)
VALUES (
  '191_merge_duplicate_sangdamrong.sql',
  'claude-code',
  'Merge duplicate Sangdamrong supplier (8b1faecc → 668b3d36), restore canonical record (MC e6a88106).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
