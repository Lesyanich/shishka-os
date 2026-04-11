-- 108: Backfill NULL checksums for migrations that used md5('filename_stem')
--
-- Root cause: migrations 094-100 self-registered with checksum = md5('<filename_stem>')
-- but check_migrations.ts computes md5(<file_contents>). This mismatch causes
-- permanent drift noise, hiding real drift.
--
-- Migration 101 already fixed 100 (replaced with real content hash).
-- This migration sets the remaining broken checksums to NULL.
-- NULL checksums are tolerated by check_migrations.ts:59:
--   `if (entry.checksum && fileChecksums.get(file) !== entry.checksum)`
--
-- Affected: 094, 095, 096, 097, 098, 099
-- Not affected: 100 (fixed by 101), 101+ (already use NULL)

UPDATE migration_log
SET checksum = NULL
WHERE filename IN (
  '094_migration_tracking.sql',
  '095_executor_type_and_roles.sql',
  '096_kitchen_ux_v2_foundation.sql',
  '097_context_files.sql',
  '098_seed_context_files.sql',
  '099_lightrag_pgvector.sql'
)
AND checksum IS NOT NULL;

-- Self-register with NULL checksum (RULE-MIGRATION-TRACKING)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '108_fix_self_register_checksums.sql',
  'claude-code',
  NULL,
  'Backfill NULL checksums for 094-099 to eliminate drift noise in check_migrations (MC 6dc92603)'
)
ON CONFLICT DO NOTHING;
