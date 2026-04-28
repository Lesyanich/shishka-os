-- 162_delete_stale_capex_placeholders.sql
-- Delete 4 stale capex_assets records with initial_value=0 (CEO-approved).
-- These are placeholder records from before proper CapEx flow was implemented.
-- Also cleans up any orphaned equipment rows linked to these assets.

BEGIN;

-- 1. Guard: verify all targets have initial_value = 0
DO $$
DECLARE
  v_count INT;
  v_bad   INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.capex_assets
  WHERE id IN (
    'fe9d2a3a-eb60-4af4-92d3-09f1dab22a8e',  -- Commercial Knife Set
    'de3b8a6e-de81-4a88-a16b-9864d7bff4a5',  -- Digital Scale 30kg
    '462a8456-b9c4-46c6-a453-b2e0b9174c05',  -- Digital Scale 5kg
    'a00a3595-2b29-44a0-9b6a-aecce139c3d0'   -- Soup Kettle Electric
  );

  RAISE NOTICE 'Found % of 4 target capex_assets records', v_count;

  -- Safety: abort if any target has initial_value > 0
  SELECT count(*) INTO v_bad
  FROM public.capex_assets
  WHERE id IN (
    'fe9d2a3a-eb60-4af4-92d3-09f1dab22a8e',
    'de3b8a6e-de81-4a88-a16b-9864d7bff4a5',
    '462a8456-b9c4-46c6-a453-b2e0b9174c05',
    'a00a3595-2b29-44a0-9b6a-aecce139c3d0'
  )
  AND initial_value > 0;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT: % target records have initial_value > 0 — refusing to delete', v_bad;
  END IF;
END $$;

-- 2. Delete any capex_transactions referencing these assets
DELETE FROM public.capex_transactions
WHERE asset_id IN (
  'fe9d2a3a-eb60-4af4-92d3-09f1dab22a8e',
  'de3b8a6e-de81-4a88-a16b-9864d7bff4a5',
  '462a8456-b9c4-46c6-a453-b2e0b9174c05',
  'a00a3595-2b29-44a0-9b6a-aecce139c3d0'
);

-- 3. Collect equipment_ids, delete capex_assets, clean up orphaned equipment
DO $$
DECLARE
  v_equipment_ids UUID[];
  v_deleted INT;
BEGIN
  -- Collect equipment links
  SELECT array_agg(DISTINCT equipment_id) INTO v_equipment_ids
  FROM public.capex_assets
  WHERE id IN (
    'fe9d2a3a-eb60-4af4-92d3-09f1dab22a8e',
    'de3b8a6e-de81-4a88-a16b-9864d7bff4a5',
    '462a8456-b9c4-46c6-a453-b2e0b9174c05',
    'a00a3595-2b29-44a0-9b6a-aecce139c3d0'
  )
  AND equipment_id IS NOT NULL;

  -- Delete the 4 capex_assets (guarded by initial_value = 0)
  DELETE FROM public.capex_assets
  WHERE id IN (
    'fe9d2a3a-eb60-4af4-92d3-09f1dab22a8e',
    'de3b8a6e-de81-4a88-a16b-9864d7bff4a5',
    '462a8456-b9c4-46c6-a453-b2e0b9174c05',
    'a00a3595-2b29-44a0-9b6a-aecce139c3d0'
  )
  AND initial_value = 0;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % capex_assets records', v_deleted;

  -- Clean up orphaned equipment rows (only if not referenced elsewhere)
  IF v_equipment_ids IS NOT NULL AND array_length(v_equipment_ids, 1) > 0 THEN
    DELETE FROM public.equipment
    WHERE id = ANY(v_equipment_ids)
    AND id NOT IN (
      SELECT DISTINCT equipment_id FROM public.capex_assets WHERE equipment_id IS NOT NULL
    )
    AND id NOT IN (
      SELECT DISTINCT equipment_id FROM public.recipes_flow WHERE equipment_id IS NOT NULL
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % orphaned equipment rows', v_deleted;
  END IF;
END $$;

-- 4. Self-register in migration_log
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '162_delete_stale_capex_placeholders.sql',
  'claude-code',
  'Delete 4 stale capex_assets with initial_value=0: Commercial Knife Set, Digital Scale 30kg, Digital Scale 5kg, Soup Kettle Electric. CEO-approved cleanup.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
