-- Migration 189: pos_status on nomenclature
-- Source: MC 7bc42a08 — separate POS readiness from menu visibility.
-- Semantics:
--   draft    (default) — incomplete data, not ready to push
--   approved          — CEO verified BOM/tech card/KBJU/taste test — ready to push to Loyverse
--   synced            — already pushed to Loyverse (loyverse_item_id populated)
-- Loyverse sync Edge Function (and fn_loyverse_sync_dish) should gate by:
--   pos_status = 'approved' AND is_available = true
--
-- Distinct from is_available: that controls customer-facing menu visibility.
-- A dish may be approved + unavailable (e.g., off-menu seasonally) — do not push.

BEGIN;

-- 1. Enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_status_enum') THEN
    CREATE TYPE pos_status_enum AS ENUM ('draft', 'approved', 'synced');
  END IF;
END $$;

-- 2. Column on nomenclature
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS pos_status pos_status_enum NOT NULL DEFAULT 'draft';

-- 3. Backfill: items that already have a loyverse_item_id are de facto synced.
-- Defensive per RULE-MIGRATION-COLUMN-EXISTENCE — only run if column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nomenclature' AND column_name = 'loyverse_item_id'
  ) THEN
    EXECUTE 'UPDATE public.nomenclature SET pos_status = ''synced''
             WHERE loyverse_item_id IS NOT NULL AND pos_status = ''draft''';
  END IF;
END $$;

-- 4. Index for the Loyverse sync gate query
CREATE INDEX IF NOT EXISTS idx_nomenclature_pos_status_available
  ON public.nomenclature (pos_status, is_available)
  WHERE pos_status = 'approved';

COMMENT ON COLUMN public.nomenclature.pos_status IS
  'POS readiness gate. draft=incomplete; approved=ready to push to Loyverse; synced=already in Loyverse. Sync gate: pos_status=''approved'' AND is_available=true.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '189_nomenclature_pos_status.sql',
  'claude-code',
  'pos_status enum + column on nomenclature (MC 7bc42a08). Backfills existing loyverse_item_id rows to synced.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
