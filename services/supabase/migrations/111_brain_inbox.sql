-- 111: brain_inbox table for CEO quick-notes from Knowledge Hub
--
-- Notes saved from admin panel Knowledge Hub page are stored here
-- instead of localStorage. Agents ingest on session start via MCP.
-- Refs: MC task 797e5b8a

BEGIN;

CREATE TABLE IF NOT EXISTS brain_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  category TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ingested', 'dismissed')),
  ingested_to TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingested_at TIMESTAMPTZ DEFAULT NULL
);

-- RLS
ALTER TABLE brain_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_insert" ON brain_inbox
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_select" ON brain_inbox
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_update" ON brain_inbox
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "service_all" ON brain_inbox
  FOR ALL TO service_role USING (true);

-- Self-register (RULE-MIGRATION-TRACKING)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '111_brain_inbox.sql',
  'claude-code',
  NULL,
  'brain_inbox table for CEO notes from Knowledge Hub (MC 797e5b8a)'
)
ON CONFLICT DO NOTHING;

COMMIT;
