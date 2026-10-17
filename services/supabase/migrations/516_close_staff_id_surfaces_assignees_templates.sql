-- 516_close_staff_id_surfaces_assignees_templates.sql
--
-- MC ef80ceed — closes two of the three remaining staff-id leak surfaces.
--
-- WHAT LEAKS
-- ------------------------------------------------------------------------------
-- Both tables carry a `staff_id` FK to `staff` and return it to the publishable key:
--
--   staff_task_assignees.staff_id      `sta_read`  roles={anon,authenticated} qual=true
--   staff_schedule_templates.staff_id  `tmpl_read` roles={public}             qual=true
--
-- `staff` itself is closed (401). These are two of the three surfaces left after 508 and
-- 512 that still let an anonymous caller collect real employee UUIDs — the ingredient that
-- made the 506 forgery attributable to a named person rather than anonymous junk.
--
-- BOTH ARE VESTIGIAL, and the creating migrations say why
-- ------------------------------------------------------------------------------
-- 244h, on `staff_schedule_templates`:
--
--     -- RLS mirrors the HR/shifts convention: anon read, authenticated write.
--
-- That "convention" is the one migration 069 invented for an open `/kitchen` dashboard and
-- that 508 has since retired as dead. The anon read here was copied from a pattern that no
-- longer had a reason even then. 244h's own header states the real consumer: "Powers the
-- /hr/schedule 'Generate Month' action and the /hr/attendance baseline" — both **owner-tier**
-- pages behind `RoleGuard minRole="owner"`.
--
-- 317, on `staff_task_assignees`, gives no reason for anon at all — it lists the consumers
-- as "admin filters, telegram-push, displays", none of which is anonymous.
--
-- CONSUMERS, CHECKED NOT ASSUMED
-- ------------------------------------------------------------------------------
--   staff_schedule_templates → apps/admin-panel/src/hooks/useScheduleTemplates.ts only,
--                              i.e. the signed-in panel on owner-tier /hr pages.
--   staff_task_assignees     → NO app code at all. Only the edge functions
--                              telegram-push and telegram-webhook.
--
-- The Telegram pair is the thing that could have gone wrong here, since the staff bot is
-- live and used daily. It cannot: both import `db` from `_shared/supabase.ts`, which builds
-- its client with `SUPABASE_SERVICE_ROLE_KEY`. **service_role bypasses RLS and the table ACL
-- entirely**, so revoking `anon` is invisible to it. Verified by reading that module, not by
-- assuming the usual Supabase convention.
--
-- SHAPE: `ALTER POLICY … TO authenticated`, which is better than what 508 did
-- ------------------------------------------------------------------------------
-- 508 had to DROP the `{public}` policy and CREATE a replacement, because dropping it
-- outright would have left `authenticated` relying on a sibling policy whose qual is
-- `auth.role() = 'authenticated'` — something a migration cannot verify without a JWT.
--
-- `ALTER POLICY … TO authenticated` does the same job in one statement: it narrows the role
-- list and **keeps `qual = true` untouched**, so `authenticated` reads unconditionally
-- before and after, with no window in which the table is uncovered and nothing depending on
-- `auth.role()` resolving. Prefer this form over drop-and-recreate when only the roles are
-- wrong. (`sta_write` and `tmpl_write` are left exactly as they are.)

BEGIN;

-- ── staff_task_assignees ─────────────────────────────────────────────────────
ALTER POLICY sta_read ON public.staff_task_assignees TO authenticated;
REVOKE ALL ON public.staff_task_assignees FROM anon;

-- ── staff_schedule_templates ─────────────────────────────────────────────────
ALTER POLICY tmpl_read ON public.staff_schedule_templates TO authenticated;
REVOKE ALL ON public.staff_schedule_templates FROM anon;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('516_close_staff_id_surfaces_assignees_templates.sql', 'claude-opus-session-df80a758', NULL,
        'MC ef80ceed: narrowed sta_read (staff_task_assignees) and tmpl_read (staff_schedule_templates) from anon/public to authenticated via ALTER POLICY, and revoked anon from both table ACLs. Both leaked staff_id to the publishable key. Both vestigial: 244h copied the dead shifts anon-read convention, 317 gave no reason for anon. Consumers are the signed-in admin panel (owner-tier /hr) and the telegram edge functions, which use SUPABASE_SERVICE_ROLE_KEY and bypass RLS/ACL. ALTER POLICY keeps qual=true so authenticated cannot regress. One staff-id surface left: staff_tasks.assigned_to.');

COMMIT;
