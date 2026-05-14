-- ═══════════════════════════════════════════════════════════
-- Migration 175: Loyverse POS Integration
-- Menu sync: config, sync log, mapping columns
-- ═══════════════════════════════════════════════════════════

-- ── 1. loyverse_config — key/value store for API settings ──

CREATE TABLE IF NOT EXISTS loyverse_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with known values (API token is NOT in DB — it's in env var)
INSERT INTO loyverse_config (key, value) VALUES
  ('store_id', 'e1786d8a-bd7e-4539-a265-11bd705c329c'),
  ('base_url', 'https://api.loyverse.com/v1.0')
ON CONFLICT (key) DO NOTHING;

-- ── 2. loyverse_sync_log — audit trail for sync operations ──

CREATE TABLE IF NOT EXISTS loyverse_sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type       TEXT NOT NULL,
  direction       TEXT NOT NULL DEFAULT 'push'
                    CHECK (direction IN ('push', 'pull')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'success', 'error')),
  records_total   INT DEFAULT 0,
  records_synced  INT DEFAULT 0,
  records_failed  INT DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loyverse_sync_log_started
  ON loyverse_sync_log (started_at DESC);

-- ── 3. Mapping columns ──

ALTER TABLE nomenclature
  ADD COLUMN IF NOT EXISTS loyverse_item_id TEXT;

ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS loyverse_category_id TEXT;

-- ── 4. RLS ──

ALTER TABLE loyverse_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyverse_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyverse_config_service_role"
  ON loyverse_config FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "loyverse_sync_log_read"
  ON loyverse_sync_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "loyverse_sync_log_write"
  ON loyverse_sync_log FOR ALL
  USING (auth.role() = 'service_role');

-- ── 5. RPCs ──

CREATE OR REPLACE FUNCTION fn_get_loyverse_config()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT jsonb_object_agg(key, value)
  FROM loyverse_config;
$$;

CREATE OR REPLACE FUNCTION fn_upsert_loyverse_config(
  p_key TEXT,
  p_value TEXT
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO loyverse_config (key, value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = p_value, updated_at = now();
$$;

-- ── 6. Self-register ──

INSERT INTO migration_log (version, name, checksum)
VALUES (175, '175_loyverse_integration', md5(pg_read_file('175_loyverse_integration.sql')))
ON CONFLICT (version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- END Migration 175
-- ═══════════════════════════════════════════════════════════
