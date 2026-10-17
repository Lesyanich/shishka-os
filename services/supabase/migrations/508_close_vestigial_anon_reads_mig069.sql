-- 508_close_vestigial_anon_reads_mig069.sql
--
-- MC ef80ceed — closes the `shifts` staff_id leak and its two siblings.
--
-- WHY THIS ONE MATTERS MORE THAN ITS ROW COUNT SUGGESTS
-- ------------------------------------------------------------------------------
-- `shifts` carries `staff_id`, and `shifts_read_anon` (`qual = true`, 206 rows) hands it
-- to anyone with the publishable key. `staff` itself is closed (401) — so `shifts` is the
-- leak that makes real employee UUIDs obtainable anonymously.
--
-- That is precisely what upgraded migration 506's vulnerability from "anon can forge a
-- waste record" to "anon can forge a waste record **attributed to a named employee**",
-- because `waste_entries.recorded_by` is `NOT NULL REFERENCES staff(id)`.
--
-- **This narrows that path; it does not close it. Measured after applying, not assumed.**
-- 26 tables still carry a staff FK with `anon` in the ACL, and four of them really do
-- still hand a staff UUID to the publishable key:
--
--   staff_task_assignees.staff_id      staff_schedule_templates.staff_id
--   staff_tasks.assigned_to            production_tasks.assigned_to
--
-- So an attacker can still obtain a real employee id, just from 10-row surfaces instead of
-- a 206-row one. The 506 sink is shut, so that specific forgery is dead either way — but
-- the next table added with a `recorded_by` FK would be exploitable again. Those four are
-- the KDS (`kds_anon_read`) and staff-Telegram surfaces, which is exactly the work that
-- needs each consumer exercised before anything is revoked. They stay on MC ef80ceed and
-- are deliberately NOT touched here; claiming otherwise would be the overclaim this
-- migration is trying to avoid.
--
-- IT IS VESTIGIAL — the feature it was written for no longer exists
-- ------------------------------------------------------------------------------
-- Migration 069 created four sibling policies under one comment:
--
--   -- Чтение для всех (открытый дашборд кухни /kitchen)
--   CREATE POLICY "staff_read_anon"           ON staff           FOR SELECT USING (true);
--   CREATE POLICY "shifts_read_anon"          ON shifts          FOR SELECT USING (true);
--   CREATE POLICY "shift_tasks_read_anon"     ON shift_tasks     FOR SELECT USING (true);
--   CREATE POLICY "equipment_slots_read_anon" ON equipment_slots FOR SELECT USING (true);
--
-- i.e. "read for everyone (open kitchen dashboard /kitchen)". **There is no open /kitchen
-- dashboard any more.** Every `/kitchen/*` route in apps/admin-panel/src/App.tsx sits
-- inside `<ProtectedRoute>`; the only routes outside it are `/login` and `/stock`, and
-- neither reads any of these tables (`StockSheetPage.tsx` is PIN-gated server-side and
-- contains zero references to them).
--
-- `staff_read_anon`, the first of the four, was already removed by someone else — `staff`
-- now carries `staff_read_auth` / `staff_read_owner` / `staff_read_self_authenticated` and
-- answers anon with 401. The other three were left behind. This finishes that job.
--
-- Consumers, checked rather than assumed: every reference to these three tables in
-- `apps/`, `services/` and `packages/` is in **apps/admin-panel**, which signs in and runs
-- as `authenticated` (ClockInNudge, useShifts, useKitchenDashboard, use-attendance,
-- useShiftClock, useScheduleTemplates, Dashboard, WeekCalendar, ShiftEditor, ActiveTasks,
-- useShiftTasks, useEquipmentSlots). The only edge function touching `shifts`
-- (telegram-push) runs on the service role and bypasses RLS entirely. No anonymous reader
-- exists. `shift_tasks` and `equipment_slots` currently return 0 rows to anon anyway.
--
-- WHY `shift_tasks` AND `equipment_slots` ARE IN HERE TOO — said out loud, not slipped in
-- ------------------------------------------------------------------------------
-- They are the same batch, from the same migration, under the same comment, justified by
-- the same dead feature, and consumed only by the same authenticated app. Closing just
-- `shifts` would mean a near-identical migration twice more. If that is not wanted, drop
-- the two blocks below and keep the `shifts` one.
--
-- WHY A NEW `_read_auth` POLICY INSTEAD OF JUST DROPPING `_read_anon`
-- ------------------------------------------------------------------------------
-- Each table also has `<t>_write_auth` — `FOR ALL`, `roles = {public}`, with
-- `qual = auth.role() = 'authenticated'`. `ALL` covers SELECT, so in principle dropping
-- `_read_anon` would leave authenticated reading through that. In principle.
--
-- It depends on `auth.role()` resolving from a real JWT, and **there is no cheap way to
-- verify that from a migration** — `SET LOCAL ROLE authenticated` has no JWT, so
-- `auth.role()` is NULL and the policy returns nothing whether or not it would work in the
-- browser. A mistake here surfaces as a staff member hitting a blank schedule mid-shift,
-- with nothing watching for it.
--
-- So each table gets an explicit `<t>_read_auth` — `FOR SELECT TO authenticated USING
-- (true)` — created **before** the anon policy is dropped. Unconditional and role-scoped,
-- so authenticated's read cannot regress regardless of how `auth.role()` behaves. It is
-- also the form RULE-RPC-GRANTS now prefers: `TO <role>` rather than `roles = {public}`
-- guarded by a helper, which makes anon raise 42501 instead of being cleanly denied.

BEGIN;

-- ── shifts — the staff_id leak ───────────────────────────────────────────────
CREATE POLICY shifts_read_auth ON public.shifts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shifts_read_anon ON public.shifts;
REVOKE ALL ON public.shifts FROM anon;

-- ── shift_tasks — same batch, same dead rationale ────────────────────────────
CREATE POLICY shift_tasks_read_auth ON public.shift_tasks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shift_tasks_read_anon ON public.shift_tasks;
REVOKE ALL ON public.shift_tasks FROM anon;

-- ── equipment_slots — same batch, same dead rationale ────────────────────────
CREATE POLICY equipment_slots_read_auth ON public.equipment_slots
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS equipment_slots_read_anon ON public.equipment_slots;
REVOKE ALL ON public.equipment_slots FROM anon;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('508_close_vestigial_anon_reads_mig069.sql', 'claude-opus-session-df80a758', NULL,
        'MC ef80ceed: closed anon SELECT on shifts (206 rows, leaked staff_id - the input that made migration 506 forgery attributable to a named employee), plus siblings shift_tasks and equipment_slots. All three are vestigial policies from migration 069 for an open /kitchen dashboard that no longer exists - every /kitchen route is behind ProtectedRoute, and the fourth sibling staff_read_anon was already removed. Replaced each with an explicit <t>_read_auth FOR SELECT TO authenticated USING (true) so authenticated cannot regress via auth.role(), then revoked anon from the table ACL. Only consumers are the authenticated admin panel and a service-role edge function. NOTE: staff UUIDs remain harvestable by anon from staff_task_assignees, staff_schedule_templates, staff_tasks.assigned_to and production_tasks.assigned_to - KDS/TWA surfaces, still open on ef80ceed.');

COMMIT;
