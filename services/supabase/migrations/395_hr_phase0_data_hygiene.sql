-- 395_hr_phase0_data_hygiene.sql
-- MC task: 679e41d4-defb-43cc-bfa5-3b6da0d11c39 (Phase 0 of the HR/payroll re-plan)
-- Spec: docs/plans/spec-hr-payroll-process.md § Part IV, Phase 0
--
-- Data-only. No schema changes, no function changes — those land in Phase 1.
--
-- THE PROBLEM. The HR section's reference data does not match the business.
-- Three concrete divergences, all confirmed against prod on 2026-07-31:
--
--  (a) WORKING HOURS. Every one of the 4 schedule templates and all 226 rows in
--      `shifts` say 09:00-18:00. The shop actually runs 09:30-18:30 (CEO,
--      2026-07-31). Every punctuality figure is therefore measured from the
--      wrong start time — `v_shift_punctuality` compares the first clock-in
--      against `shifts.start_time`, so a 09:25 arrival reads as 25 minutes late
--      against a shift that does not exist.
--
--  (b) GHOST SHIFTS. Alex (9c979e6b) resigned on 2026-07-07. He still holds 20
--      scheduled shifts dated after his fire_date, running to 2026-07-31.
--      Phase 1 derives `days_worked` FROM the schedule, so leaving these in
--      place would pay a departed employee for three weeks he did not work.
--      This migration removes them; the cascade-on-offboarding rule that stops
--      them being created again is Phase 1.
--
--  (c) SSO CEILING. `payroll_config.sso_ceiling_thb` = 17500. The long-standing
--      statutory ceiling is 15000; 17500 matches a proposed staged increase.
--      NOT changed here — a wrong ceiling silently mis-states every future
--      contribution in both directions, so it needs the official announcement,
--      not a guess. Flagged in the config description so the next reader sees
--      the doubt instead of trusting the number.
--
-- SCOPE OF THE TIME CHANGE. Templates, plus shifts from 2026-07-01 onward only.
-- Historical shifts (June and earlier, 122 rows) are left alone deliberately:
-- they are the record of what was actually scheduled at the time, and rewriting
-- them would retroactively restate past punctuality. Nothing has ever been
-- deducted for lateness (`unworked_time_adjustments` is empty), so moving July's
-- start time later is safe in both directions — it can only make July's
-- unenforced lateness figures more forgiving, never harsher.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Working hours 09:00-18:00 -> 09:30-18:30
-- ---------------------------------------------------------------------------

UPDATE public.staff_schedule_templates
SET    start_time = '09:30:00',
       end_time   = '18:30:00',
       updated_at = now()
WHERE  start_time = '09:00:00'
  AND  end_time   = '18:00:00';

UPDATE public.shifts
SET    start_time = '09:30:00',
       end_time   = '18:30:00',
       updated_at = now()
WHERE  shift_date >= DATE '2026-07-01'
  AND  start_time = '09:00:00'
  AND  end_time   = '18:00:00';

-- ---------------------------------------------------------------------------
-- 2. Remove Alex's shifts scheduled after his fire_date
-- ---------------------------------------------------------------------------
-- Verified before writing: zero clock_events reference any of these shifts, so
-- nothing is orphaned. Bounded by fire_date read from `staff` rather than a
-- hardcoded date, so the statement cannot outrun a correction to that field.

DELETE FROM public.shifts sh
USING  public.staff s
WHERE  s.id = sh.staff_id
  AND  s.fire_date IS NOT NULL
  AND  sh.shift_date > s.fire_date;

-- ---------------------------------------------------------------------------
-- 3. Mark the SSO ceiling as unverified (value untouched)
-- ---------------------------------------------------------------------------

UPDATE public.payroll_config
SET    description = 'Monthly salary ceiling for SSO calculation (2026). '
                  || 'UNVERIFIED as of 2026-07-31 — the long-standing statutory ceiling is 15000 '
                  || 'and 17500 matches a proposed staged increase. Confirm against the official '
                  || 'announcement BEFORE the first contribution is calculated (MC 679e41d4).',
       updated_at  = now()
WHERE  key = 'sso_ceiling_thb';

-- ---------------------------------------------------------------------------
-- 4. Ledger
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('395_hr_phase0_data_hygiene.sql', 'claude-opus-session-eb56fda0', 'success',
        'HR Phase 0 data hygiene: working hours 09:00-18:00 -> 09:30-18:30 on all 4 schedule '
     || 'templates and on shifts from 2026-07-01 onward (historical shifts left as the record of '
     || 'what was scheduled); removed 20 ghost shifts held by Alex after his 2026-07-07 fire_date, '
     || 'bounded by staff.fire_date rather than hardcoded; flagged sso_ceiling_thb=17500 as '
     || 'unverified without changing it. No schema or function changes. MC 679e41d4.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- The shift deletion is not reversible from this file — the removed rows were
-- pure schedule noise for a departed employee, with no clock events attached.
-- Regenerate from the template via the schedule runner if ever needed.
--
-- BEGIN;
-- UPDATE public.staff_schedule_templates SET start_time='09:00:00', end_time='18:00:00'
--   WHERE start_time='09:30:00' AND end_time='18:30:00';
-- UPDATE public.shifts SET start_time='09:00:00', end_time='18:00:00'
--   WHERE shift_date >= DATE '2026-07-01' AND start_time='09:30:00' AND end_time='18:30:00';
-- DELETE FROM public.migration_log WHERE filename='395_hr_phase0_data_hygiene.sql';
-- COMMIT;
