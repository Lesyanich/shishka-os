-- Migration 195 — raw mirror of Loyverse modifier_lists + options
-- These tables are read-only mirror; refreshed by Edge Function pull_modifiers action.
-- Each pull deletes all rows and re-inserts from Loyverse API response.

BEGIN;

CREATE TABLE pos_loyverse_modifier_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_select INT,
  max_select INT,
  raw JSONB NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pos_loyverse_modifier_options (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL
    REFERENCES pos_loyverse_modifier_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC,
  raw JSONB NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_loyverse_options_list
  ON pos_loyverse_modifier_options(list_id);

COMMENT ON TABLE pos_loyverse_modifier_lists IS
  'Raw mirror of Loyverse modifier_lists. Fully refreshed by loyverse-sync pull_modifiers action.';
COMMENT ON TABLE pos_loyverse_modifier_options IS
  'Raw mirror of Loyverse modifier options. CEO maps each row to a (dish, MOD-*, slot, qty) tuple via /menu/modifiers admin UI.';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '195_pos_loyverse_modifier_mirror.sql',
  'claude-code',
  'Raw mirror tables for Loyverse modifier_lists + options. Read-only; refreshed by pull_modifiers Edge Function action. Lego flow Phase 1.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
