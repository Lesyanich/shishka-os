-- 357_renumber_station_stock_collision_log_sync.sql
-- Renumber log-sync for PR #479 (station-stock v1, MC 563af492 + S1 72950d62).
--
-- The station-stock migrations were applied to prod under numbers 348-356 while
-- parallel branches independently merged UNRELATED migrations at the same
-- numbers (348 staff-task categories, 352 web-visibility guard, 353 log-renumber,
-- 354 monday-shifts, 355 clock-link, 356 delete-sunday-shifts). Per the renumber
-- guard procedure (services/supabase/migrations/RENUMBERING-2026-06-11.md,
-- precedent migs 267/282): the number's OWNER is whoever applied FIRST — verified
-- against public.migration_log (ledger of record). main's files applied first at
-- every colliding number, so main keeps 348/352/353/354/355/356 and the
-- station-stock files move to letter-suffix slots at their applied position.
-- This migration remaps migration_log.filename so the ledger matches the renamed
-- repo files. Repo-only rename — prod SCHEMA is untouched.
--
-- Renames (old -> new), lexicographic order = prod-apply order:
--   348_stations_and_categories.sql       -> 348a_stations_and_categories.sql
--   352_stocktake_session_fns.sql         -> 352a_stocktake_session_fns.sql
--   353_station_count_mode_finished.sql   -> 353a_station_count_mode_finished.sql
--   354_bread_station_finished.sql        -> 353b_bread_station_finished.sql   (applied but NEVER logged)
--   355_stocktake_routing.sql             -> 356a_stocktake_routing.sql
--   356_stock_check_task_templates.sql    -> 356b_stock_check_task_templates.sql
-- (349 / 350 / 350a / 351 keep their numbers — no collision on main.)
--
-- Idempotent: on a fresh replay the renamed files self-register their NEW names,
-- so each UPDATE matches 0 rows and the bread INSERT hits ON CONFLICT DO NOTHING.

UPDATE public.migration_log SET filename = '348a_stations_and_categories.sql'
  WHERE filename = '348_stations_and_categories.sql';
UPDATE public.migration_log SET filename = '352a_stocktake_session_fns.sql'
  WHERE filename = '352_stocktake_session_fns.sql';
UPDATE public.migration_log SET filename = '353a_station_count_mode_finished.sql'
  WHERE filename = '353_station_count_mode_finished.sql';
UPDATE public.migration_log SET filename = '356a_stocktake_routing.sql'
  WHERE filename = '355_stocktake_routing.sql';
UPDATE public.migration_log SET filename = '356b_stock_check_task_templates.sql'
  WHERE filename = '356_stock_check_task_templates.sql';

-- 354_bread_station_finished was applied to prod (stations.code='bread' is
-- count_mode='finished') but its self-register never ran — backfill the row
-- under the renamed filename so check_migrations sees it as applied.
INSERT INTO public.migration_log (filename, applied_by, checksum, notes)
VALUES (
  '353b_bread_station_finished.sql',
  'claude-code',
  NULL,
  'Backfilled by 357: schema was applied (bread count_mode=finished) but the original 354_bread_station_finished self-register never ran. Renamed from 354 (collision with 354_monday_shifts).'
)
ON CONFLICT DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '357_renumber_station_stock_collision_log_sync.sql',
  'claude-code',
  NULL,
  'PR #479 station-stock renumber log-sync: remap migration_log.filename 348->348a, 352->352a, 353->353a, 355->356a, 356->356b + backfill 353b (ex-354 bread, applied-but-unlogged). main keeps the colliding numbers (applied first per ledger). Guard procedure RENUMBERING-2026-06-11.md. MC 563af492.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference — reverses the log remap):
-- UPDATE public.migration_log SET filename='356_stock_check_task_templates.sql' WHERE filename='356b_stock_check_task_templates.sql';
-- UPDATE public.migration_log SET filename='355_stocktake_routing.sql'          WHERE filename='356a_stocktake_routing.sql';
-- UPDATE public.migration_log SET filename='353_station_count_mode_finished.sql' WHERE filename='353a_station_count_mode_finished.sql';
-- UPDATE public.migration_log SET filename='352_stocktake_session_fns.sql'       WHERE filename='352a_stocktake_session_fns.sql';
-- UPDATE public.migration_log SET filename='348_stations_and_categories.sql'     WHERE filename='348a_stations_and_categories.sql';
-- DELETE FROM public.migration_log WHERE filename IN ('353b_bread_station_finished.sql','357_renumber_station_stock_collision_log_sync.sql');
