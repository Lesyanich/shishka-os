-- 101: Fix migration_log.checksum for migration 100
--
-- Root cause: migration 100 (and historically 094/096/097/098) self-registers with
--   checksum = md5('100_fix_kitchen_ux_v2_spec_path')   -- md5 of filename stem
-- but check_migrations computes
--   md5(<file contents>)
-- (services/mcp-mission-control/src/tools/check-migrations.ts:26-28) and flags any
-- row whose logged checksum ≠ file-content md5 as drift (line 59).
--
-- Quick fix for 100 only: replace the stored checksum with the real content md5.
-- Pre-existing drift for 094/096/097/098 is out of scope and would need its own
-- audit task (they were applied long ago and re-hashing them blind is risky).
--
-- Computed on host: `md5 -q services/supabase/migrations/100_fix_kitchen_ux_v2_spec_path.sql`

UPDATE migration_log
SET checksum = 'a5e17b8e84d0c0b34737436b89b217c4'
WHERE filename = '100_fix_kitchen_ux_v2_spec_path.sql';

-- Self-register with NULL checksum on purpose: the drift check at
-- check-migrations.ts:59 is `if (entry.checksum && ...)` so NULL skips the
-- comparison entirely. Storing md5(file_contents) inside the file is a
-- chicken-and-egg problem; NULL is the clean escape.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '101_fix_migration_100_checksum.sql',
  'claude-code',
  NULL,
  'Fix migration_log.checksum for 100 — replace filename-stem md5 with file-content md5'
)
ON CONFLICT DO NOTHING;
