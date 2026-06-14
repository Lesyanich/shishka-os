-- 282_renumber_273_275_collision_log_sync.sql
-- Renames migration_log rows to match the repo-side renumbering of 3 colliding
-- migration files (duplicate 273/274/275 prefixes that failed the pre-commit
-- migration canary). The files were already applied to prod under the names on
-- the left; only the filename bookkeeping changes here — no schema change.
-- Old->new mapping doc: services/supabase/migrations/RENUMBERING-2026-06-11.md
--
-- Mapping (repo file is renamed to match the row this UPDATE produces):
--   267_fix_fn_link_telegram_ambiguous.sql  ->  272a_fix_fn_link_telegram_ambiguous.sql
--   268_staff_tasks_cron.sql                ->  276a_staff_tasks_cron.sql
--   275_staff_app_role_task_manager.sql     ->  279a_staff_app_role_task_manager.sql
--
-- Why these anchors: each moved file lands directly after the latest
-- kept-name migration applied strictly before it (per applied_at in
-- public.migration_log), so lexicographic replay order matches prod order:
--   272 (07:36) < 272a telegram-fix (applied as 267 @ 07:41) < 273 recipes (08:14)
--   276 (07:52) < 276a staff-cron   (applied as 268 @ 07:53) < 277 cash (08:09)
--   279 (08:38) < 279a task-manager (applied as 275 @ 09:13)  [tail]
--
-- The two telegram/cron files were applied to prod under their original branch
-- numbers (267_/268_) before the repo renamed them to 273_/274_; this UPDATE
-- reconciles the stale 267_/268_ rows directly to the final 272a_/276a_ names.

UPDATE migration_log SET filename = '272a_fix_fn_link_telegram_ambiguous.sql',
  notes = COALESCE(notes, '') || ' [renamed from 267_fix_fn_link_telegram_ambiguous.sql (repo had 273_), renumber 2026-06-14]'
  WHERE filename = '267_fix_fn_link_telegram_ambiguous.sql';

UPDATE migration_log SET filename = '276a_staff_tasks_cron.sql',
  notes = COALESCE(notes, '') || ' [renamed from 268_staff_tasks_cron.sql (repo had 274_), renumber 2026-06-14]'
  WHERE filename = '268_staff_tasks_cron.sql';

UPDATE migration_log SET filename = '279a_staff_app_role_task_manager.sql',
  notes = COALESCE(notes, '') || ' [renamed from 275_staff_app_role_task_manager.sql, renumber 2026-06-14]'
  WHERE filename = '275_staff_app_role_task_manager.sql';


-- Self-register (RULE-MIGRATION-TRACKING)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '282_renumber_273_275_collision_log_sync.sql',
  'claude-code',
  NULL,
  'Rename 3 migration_log rows to renumbered filenames; 273/274/275 collision cleanup'
)
ON CONFLICT (filename) DO NOTHING;
