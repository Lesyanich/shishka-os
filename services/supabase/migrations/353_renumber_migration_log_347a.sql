-- 353_renumber_migration_log_347a.sql
-- Repo↔ledger sync for the 347 numbering collision (PR #475 and PR #476 merged
-- in parallel, each carrying a 347): per the renumbering rule
-- (RENUMBERING-2026-06-11.md, precedent mig 267) the earlier-applied file keeps
-- its name, the later one gets a letter suffix so lexicographic replay order
-- matches the order the migrations actually hit prod:
--   347_shift_hours_0900_1800.sql        applied 2026-07-03 08:20 UTC — keeps name
--   347_kb_seed_translations_th_my.sql   applied 2026-07-03 08:29 UTC — → 347a_
-- The file is renamed in the same commit; this migration renames its ledger row.
--
-- NOTE: numbers 348-352 are taken by applied-but-unmerged migrations
-- (PR #479: 348_stations_and_categories + 349-351 + 352_stocktake_session_fns;
-- PR #481: 352_guard_web_visibility_archived_dishes; this branch:
-- 348_staff_task_equipment_foodsafety_categories) — hence 353.

UPDATE public.migration_log
   SET filename = '347a_kb_seed_translations_th_my.sql',
       notes = COALESCE(notes, '')
               || ' [renamed from 347_kb_seed_translations_th_my.sql, renumber 2026-07-04]'
 WHERE filename = '347_kb_seed_translations_th_my.sql';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('353_renumber_migration_log_347a.sql', 'claude-code',
  'Rename migration_log row 347_kb_seed_translations_th_my.sql -> 347a_ (347 number collision from parallel PRs #475/#476); repo file renamed in the same commit.')
ON CONFLICT (filename) DO NOTHING;
