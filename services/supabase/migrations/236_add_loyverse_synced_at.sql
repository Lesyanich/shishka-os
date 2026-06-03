-- Track when a nomenclature item was last pushed/synced to Loyverse POS.
-- Distinct from updated_at (which changes on any edit). Populated by the
-- loyverse-sync edge function on every successful push (push_dish, push_menu,
-- recreate). NULL = never synced (or synced before this column existed).
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS loyverse_synced_at timestamptz;

COMMENT ON COLUMN public.nomenclature.loyverse_synced_at IS
  'Timestamp of the last successful push to Loyverse POS. Set by loyverse-sync edge function. NULL = never synced.';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('236_add_loyverse_synced_at.sql', 'Add nomenclature.loyverse_synced_at for last-sync display on /menu', NULL)
ON CONFLICT (filename) DO NOTHING;
