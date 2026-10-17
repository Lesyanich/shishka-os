-- 512_close_kds_anon_read_production_tasks.sql
--
-- MC ef80ceed — closes `kds_anon_read`, one of the four remaining staff-id leaks.
--
-- WHY NOW: THE KDS IS DEAD, MEASURED
-- ------------------------------------------------------------------------------
-- `kds_anon_read` (`qual = true`, 82 rows) exists for a Kitchen Display System that is
-- not in use. Measured against prod 2026-10-17:
--
--   production_tasks ........ 82 rows, last created 2026-04-13, last updated 2026-04-14
--   by status ............... 40 blocked · 39 pending · 3 in_progress · 0 completed, ever
--   production_task_outputs . 0 rows
--   production_log .......... 0 rows
--   haccp_logs .............. 0 rows   (its sink, closed in 506)
--   waste_entries ........... 0 rows   (ditto)
--
-- Not one task was ever finished, three are still stuck `in_progress` from April, and
-- every downstream table the KDS would write is empty. That is a pilot abandoned mid-use,
-- six months ago. 24 h of edge_logs show no reads of `/rest/v1/production_tasks` other
-- than this session's own probes.
--
-- WHY IT MATTERS BEYOND A DEAD FEATURE
-- ------------------------------------------------------------------------------
-- `production_tasks.assigned_to` is `REFERENCES staff(id)`, so this policy is one of the
-- four surfaces still handing real employee UUIDs to the publishable key after 508. It was
-- also the source of the `production_task_id` used to prove the 506 forgery. Closing it
-- removes one of those four.
--
-- NOT THE SAME SHAPE AS 508, AND DELIBERATELY SO
-- ------------------------------------------------------------------------------
-- 508 had to create a replacement `<t>_read_auth` because `shifts_read_anon` was
-- `roles = {public}` — dropping it would have taken `authenticated` with it.
--
-- `kds_anon_read` is `roles = {anon}`. It never served `authenticated`, so **no
-- replacement policy is needed and adding one would be redundant noise.** `authenticated`
-- keeps three independent SELECT policies here: `auth_full_access`
-- (`fn_is_authenticated()`), `production_tasks_read_assigned` and
-- `production_tasks_read_owner`. Copying 508's form mechanically would have widened
-- `authenticated` from "own or owner" to "everything" — the opposite of the intent.
--
-- NOTED, NOT BUNDLED
-- ------------------------------------------------------------------------------
-- Two further policies on this table are vestigial in the same way:
--
--   "Authenticated users can view all tasks"  SELECT roles={public}
--       qual: current_setting('app.tg_user_id', true) IS NOT NULL
--   "Cooks can update own or unclaimed tasks" UPDATE roles={public}  (same setting)
--
-- Nothing in either repo ever sets `app.tg_user_id` — the only mention is a comment in
-- migration 273. They are `roles = {public}`, so they would admit anon if that setting
-- were ever set; anon cannot set it (no function grants since 490), and after this
-- migration anon is blocked at the ACL anyway. Left in place rather than folded in, and
-- filed on ef80ceed — the scope asked for was `kds_anon_read`.

BEGIN;

DROP POLICY IF EXISTS kds_anon_read ON public.production_tasks;
REVOKE ALL ON public.production_tasks FROM anon;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('512_close_kds_anon_read_production_tasks.sql', 'claude-opus-session-df80a758', NULL,
        'MC ef80ceed: dropped kds_anon_read on production_tasks and revoked anon from the table ACL. The KDS is dead - 82 rows frozen since 2026-04-14, zero tasks ever completed, every downstream table (production_task_outputs, production_log, haccp_logs, waste_entries) empty, and no reads in 24h of edge_logs beyond this session probes. Removes one of the four remaining staff-id leak surfaces (assigned_to REFERENCES staff). No replacement policy: kds_anon_read was roles={anon} only, so authenticated was never served by it and keeps auth_full_access / read_assigned / read_owner. Two dead app.tg_user_id policies on the same table noted but deliberately left, filed on ef80ceed.');

COMMIT;
