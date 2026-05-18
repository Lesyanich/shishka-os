-- Migration 196 — RPC for atomic refresh of pos_loyverse_modifier_lists + options.
-- Called by Edge Function loyverse-sync?action=pull_modifiers.
-- TRUNCATEs both mirror tables in a single TX so a failed pull never leaves them empty.

BEGIN;

CREATE OR REPLACE FUNCTION fn_refresh_loyverse_modifier_mirror(
  p_lists JSONB,
  p_options JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE pos_loyverse_modifier_lists CASCADE; -- INTENTIONAL TRUNCATE: full mirror refresh, options cascade via FK

  INSERT INTO pos_loyverse_modifier_lists (id, name, min_select, max_select, raw)
  SELECT
    e->>'id',
    e->>'name',
    NULLIF(e->>'min_select','')::int,
    NULLIF(e->>'max_select','')::int,
    e->'raw'
  FROM jsonb_array_elements(p_lists) AS e;

  INSERT INTO pos_loyverse_modifier_options (id, list_id, name, price, raw)
  SELECT
    e->>'id',
    e->>'list_id',
    e->>'name',
    NULLIF(e->>'price','')::numeric,
    e->'raw'
  FROM jsonb_array_elements(p_options) AS e;

  -- Refresh loyverse_modifier_list_name snapshot on matched bindings.
  UPDATE nomenclature_modifier_options nmo
  SET loyverse_modifier_list_name = pml.name,
      loyverse_modifier_list_id = pml.id
  FROM pos_loyverse_modifier_options pmo
  JOIN pos_loyverse_modifier_lists pml ON pml.id = pmo.list_id
  WHERE nmo.loyverse_modifier_id = pmo.id;
END;
$$;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '196_fn_refresh_loyverse_modifier_mirror.sql',
  'claude-code',
  'RPC fn_refresh_loyverse_modifier_mirror — atomic refresh of Loyverse modifier mirror tables. Called by Edge Function pull_modifiers action.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
