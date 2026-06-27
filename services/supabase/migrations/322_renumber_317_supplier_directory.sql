-- 322_renumber_317_supplier_directory.sql
-- Phase 3 (Stock & Reorder): deconflict the 317 collision.
--
-- Two migrations were applied under the same number 317 on 2026-06-27:
--   317_staff_task_multi_assignee.sql   (telegram multi-assignee, 09:12)
--   317_supplier_directory_fields.sql   (procurement v1,          13:44)
-- The migration-canary numbering guard rejects duplicate numeric prefixes
-- ("replay in undefined order"). Per the documented procedure
-- (services/supabase/migrations/RENUMBERING-2026-06-11.md) the NEWER file is
-- renamed to a fresh letter-suffixed number and migration_log.filename is
-- UPDATEd to match. The file 317_supplier_directory_fields.sql is renamed on
-- disk to 317a_supplier_directory_fields.sql; this migration syncs the ledger.
--
-- Pure bookkeeping — no schema change. Idempotent.

UPDATE migration_log
   SET filename = '317a_supplier_directory_fields.sql'
 WHERE filename = '317_supplier_directory_fields.sql';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '322_renumber_317_supplier_directory.sql',
  'claude-code',
  NULL,
  'Renumber 317_supplier_directory_fields.sql -> 317a (deconflict 317 collision with 317_staff_task_multi_assignee); migration_log.filename sync only.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- UPDATE migration_log SET filename='317_supplier_directory_fields.sql'
--  WHERE filename='317a_supplier_directory_fields.sql';
