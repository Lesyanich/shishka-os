-- 518_close_staff_tasks_anon_read.sql
--
-- MC ef80ceed — the LAST staff-id leak surface.
--
-- `staff_tasks.assigned_to` is `REFERENCES staff(id)`, and `staff_tasks_read_anon`
-- (`{anon,authenticated}`, `qual = true`) handed it to the publishable key. It is the only
-- surface left after 508, 512 and 516 from which an anonymous caller could still collect a
-- real employee UUID — the ingredient that made the 506 forgery attributable to a named
-- person rather than anonymous junk.
--
-- WHY THIS ONE NEEDED MORE PROOF THAN THE OTHERS
-- ------------------------------------------------------------------------------
-- The five already closed were all dormant or dead tables. **`staff_tasks` is not**: 3757
-- rows, written today, the live Telegram staff tracker. So "it is probably vestigial like
-- the rest" was not good enough — a wrong call here blanks the task board that staff open
-- every day. Four independent checks, all pointing the same way:
--
-- 1. **The creating migration.** 264a says:
--
--        -- RLS — read for anon+authenticated (mirrors shifts/staff), write authenticated.
--        -- Owner-only management is enforced in the admin UI via RoleGuard.
--
--    "mirrors shifts/staff" — the third copy of migration 069's convention for an open
--    `/kitchen` dashboard. `staff_read_anon` was removed by someone else long ago,
--    `shifts_read_anon` went in 508. The anon read here was inherited, never reasoned for.
--
-- 2. **App consumers.** `useStaffTasks.ts` is the only one, used by `KitchenTasksPage`
--    (routes `/kitchen/my-tasks` and `/staff-tasks`). Both sit behind `<ProtectedRoute>`,
--    which renders a spinner and **no children at all** while `AuthContext.loading` is
--    true, then redirects to `/login` when there is no user. The hook therefore cannot
--    mount before the session resolves — there is no pre-auth fetch to break. This matters
--    because `fetchData` is `useCallback(…, [])` and its effect runs once on mount: had
--    rendering been allowed pre-session, closing anon would have left a permanently empty
--    board with no refetch.
--
-- 3. **Edge functions.** `telegram-push`, `telegram-ai` and `telegram-webhook` all import
--    `db` from `_shared/supabase.ts`, built with `SUPABASE_SERVICE_ROLE_KEY`. service_role
--    bypasses RLS and the ACL entirely, so the bot is unaffected.
--
-- 4. **Real traffic**, 24 h of edge_logs, with my own `curl` and the service-role Deno
--    runtime filtered out. Every actual `GET` carries `request.sb.auth_user`. The only
--    auth-less entries are `OPTIONS` — CORS preflight, which carries no credentials by
--    design and is answered before any policy runs.
--
--    Two traps inside that one check, both of which nearly produced a wrong answer:
--    an empty `auth_user` does **not** mean anon (it is empty for service_role too), and
--    the raw per-UA counts looked like live anon usage until the method column was read.
--
-- RENAME, because the name would otherwise lie
-- ------------------------------------------------------------------------------
-- A policy called `staff_tasks_read_anon` that no longer admits anon is exactly the trap
-- documented for storage policies — the name reads as authoritative and the qual is where
-- the truth lives. Renamed to `staff_tasks_read_auth` in the same statement run.
--
-- Shape is 516's: `ALTER POLICY … TO authenticated` narrows the role list in one statement
-- and leaves `qual = true` untouched, so `authenticated` reads unconditionally before and
-- after, with no uncovered window. `staff_tasks_write_auth` is not touched.

BEGIN;

ALTER POLICY staff_tasks_read_anon ON public.staff_tasks TO authenticated;
ALTER POLICY staff_tasks_read_anon ON public.staff_tasks RENAME TO staff_tasks_read_auth;
REVOKE ALL ON public.staff_tasks FROM anon;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('518_close_staff_tasks_anon_read.sql', 'claude-opus-session-df80a758', NULL,
        'MC ef80ceed: closed the LAST staff-id leak surface. Narrowed staff_tasks_read_anon from {anon,authenticated} to {authenticated} via ALTER POLICY (qual=true untouched), renamed it staff_tasks_read_auth so the name stops lying, and revoked anon from the table ACL. staff_tasks is LIVE (3757 rows, written today), so this took four checks: migration 264a copied the dead shifts/staff convention; the only app reader sits behind ProtectedRoute which blocks rendering until the session resolves; the telegram edge functions use SUPABASE_SERVICE_ROLE_KEY; and 24h of edge_logs show every real GET carrying auth_user, the only auth-less entries being CORS OPTIONS preflights.');

COMMIT;
