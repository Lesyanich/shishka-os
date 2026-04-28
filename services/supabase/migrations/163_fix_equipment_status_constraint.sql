-- 163_fix_equipment_status_constraint.sql
-- Fix equipment_status_check constraint mismatch.
--
-- Root cause: migration 070 used ADD COLUMN IF NOT EXISTS for 'status',
-- but the column already existed from the original equipment table with
-- a different CHECK constraint accepting 'available' instead of 'active'.
-- The IF NOT EXISTS clause silently skipped the new CHECK.
--
-- This migration:
-- 1. Drops the old constraint
-- 2. Creates a unified constraint accepting BOTH 'active' and 'available'
-- 3. Normalizes existing 'active' rows to 'available' for consistency

-- Drop the existing constraint (name may vary)
DO $$
BEGIN
  -- Try the name from migration 070
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'equipment'
    AND constraint_name = 'equipment_status_check'
  ) THEN
    ALTER TABLE public.equipment DROP CONSTRAINT equipment_status_check;
  END IF;

  -- Also try the auto-generated name pattern
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE 'equipment_status_%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.equipment DROP CONSTRAINT ' || constraint_name
      FROM information_schema.check_constraints
      WHERE constraint_name LIKE 'equipment_status_%'
      LIMIT 1
    );
  END IF;
END $$;

-- Add unified constraint accepting both 'active' and 'available'
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_status_check
  CHECK (status IN ('active', 'available', 'maintenance', 'out_of_service', 'retired'));

-- Normalize: convert any 'active' rows to 'available' for consistency
UPDATE public.equipment
SET status = 'available'
WHERE status = 'active';

-- Set default for new rows
ALTER TABLE public.equipment
  ALTER COLUMN status SET DEFAULT 'available';

-- Self-register in migration_log
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '163_fix_equipment_status_constraint.sql',
  'claude-code',
  'Fix equipment_status_check: accept both active/available, normalize to available. Root cause: 070 IF NOT EXISTS skipped new CHECK.'
) ON CONFLICT (filename) DO NOTHING;
