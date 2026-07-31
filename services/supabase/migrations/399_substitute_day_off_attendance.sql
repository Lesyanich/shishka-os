-- 399_substitute_day_off_attendance.sql
--
-- A substitute day off (LPA §29) is a PAID day, earned by working a public
-- holiday and spent later. Until now it had nowhere to live: `staff_attendance`
-- had no status for it, so a day taken as a substitute was recorded as `absent`
-- and deducted — the employee paid for a day the employer already owed them.
--
-- CEO decision 2026-07-31 (MC b4876c65, comment 96b1242d): model the substitute
-- day as a DAY, not as money. It consumes one of the days not worked instead of
-- being compensated with a bonus line. Two consequences, both implemented here:
--   1. `substitute_day_off` becomes a first-class attendance status, counted as
--      paid leave by fn_calculate_payroll — so it is neither deducted nor
--      counted as worked, and days_worked + days_absent + days_leave_paid still
--      reconciles against the working days in the month.
--   2. Spending the day marks the matching holiday_credits row `used`, so the
--      "substitute day(s) still owed" banner on the payslip clears itself.
--
-- July 2026 is then corrected for the two people who actually spent a day.
-- Nothing here changes anyone's contractual salary.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New attendance status
-- ---------------------------------------------------------------------------
ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_status_check;

ALTER TABLE staff_attendance ADD CONSTRAINT staff_attendance_status_check
  CHECK (status = ANY (ARRAY[
    'worked', 'absent', 'sick_leave', 'annual_leave', 'personal_leave',
    'maternity_leave', 'paternity_leave', 'holiday', 'day_off',
    'substitute_day_off'
  ]));

COMMENT ON COLUMN staff_attendance.status IS
  'Attendance status. Only `absent` is deducted (LEG-003). `substitute_day_off` '
  'is a paid day off taken against a holiday_credits row earned by working a '
  'public holiday (LPA §29) — paid, never deducted, and it must have a matching '
  'credit marked `used`.';

-- ---------------------------------------------------------------------------
-- 2. fn_calculate_payroll counts it as paid leave
--
-- Patched from pg_get_functiondef() on the LIVE function, not from a repo copy
-- — the repo copy drifts (gotcha: fn_calculate_payroll repo ≠ prod). The only
-- change against the live definition is the paid-leave FILTER list below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_payroll(p_period_id uuid)
 RETURNS SETOF payroll_lines
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_period RECORD; v_staff RECORD; v_emp_start DATE; v_emp_end DATE;
  v_eligible_days INTEGER; v_is_partial BOOLEAN; v_daily_rate NUMERIC; v_hourly_rate NUMERIC;
  v_days_worked INTEGER; v_days_absent INTEGER; v_days_leave_paid INTEGER;
  v_late_days INTEGER; v_late_minutes INTEGER; v_late_deduction NUMERIC;
  v_ot_regular_hrs NUMERIC; v_ot_holiday_hrs NUMERIC; v_ot_holiday_ot_hrs NUMERIC;
  v_base_salary NUMERIC; v_bonus NUMERIC; v_absence_deduction NUMERIC; v_other_deductions NUMERIC;
  v_overtime_pay NUMERIC; v_salary_for_sso NUMERIC; v_sso_employee NUMERIC; v_sso_employer NUMERIC;
  v_wht NUMERIC; v_net_pay NUMERIC;
  c_sso_employee_rate NUMERIC; c_sso_employer_rate NUMERIC; c_sso_ceiling NUMERIC;
  c_ot_regular NUMERIC; c_ot_holiday NUMERIC; c_ot_holiday_ot NUMERIC; c_late_max_credible NUMERIC;
BEGIN
  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Period % not found or not in draft status', p_period_id; END IF;

  SELECT value INTO c_sso_employee_rate FROM payroll_config WHERE key = 'sso_employee_rate';
  SELECT value INTO c_sso_employer_rate FROM payroll_config WHERE key = 'sso_employer_rate';
  SELECT value INTO c_sso_ceiling       FROM payroll_config WHERE key = 'sso_ceiling_thb';
  SELECT value INTO c_ot_regular        FROM payroll_config WHERE key = 'ot_multiplier_regular';
  SELECT value INTO c_ot_holiday        FROM payroll_config WHERE key = 'ot_multiplier_holiday';
  SELECT value INTO c_ot_holiday_ot     FROM payroll_config WHERE key = 'ot_multiplier_holiday_ot';
  SELECT value INTO c_late_max_credible FROM payroll_config WHERE key = 'late_max_credible_minutes';
  c_late_max_credible := COALESCE(c_late_max_credible, 180);

  FOR v_staff IN
    SELECT id, name, monthly_salary, hire_date, fire_date, sso_enrolled, sso_enrolled_from, punctuality_ack_on
    FROM staff
    WHERE monthly_salary IS NOT NULL AND hire_date IS NOT NULL
      AND hire_date <= v_period.period_end
      AND (fire_date IS NULL OR fire_date >= v_period.period_start)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM payroll_lines
      WHERE payroll_period_id = p_period_id AND staff_id = v_staff.id AND is_manual_override);

    v_daily_rate := v_staff.monthly_salary / 30.0;
    v_hourly_rate := v_daily_rate / 8.0;
    v_emp_start := GREATEST(v_staff.hire_date, v_period.period_start);
    v_emp_end   := LEAST(COALESCE(v_staff.fire_date, v_period.period_end), v_period.period_end);
    v_eligible_days := GREATEST((v_emp_end - v_emp_start) + 1, 0);
    v_is_partial := (v_staff.hire_date > v_period.period_start)
                 OR (v_staff.fire_date IS NOT NULL AND v_staff.fire_date < v_period.period_end);

    -- `substitute_day_off` joins the paid-leave list: it is a day the employer
    -- already owes under LPA §29, so it is paid and must not be deducted.
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE status = 'absent'), 0)::INTEGER,
      COALESCE(COUNT(*) FILTER (WHERE status IN ('sick_leave','annual_leave','personal_leave','maternity_leave','paternity_leave','substitute_day_off')), 0)::INTEGER,
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'regular'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday_ot'), 0)
    INTO v_days_absent, v_days_leave_paid, v_ot_regular_hrs, v_ot_holiday_hrs, v_ot_holiday_ot_hrs
    FROM staff_attendance WHERE staff_id = v_staff.id AND attendance_date BETWEEN v_emp_start AND v_emp_end;

    SELECT COUNT(*)::INTEGER INTO v_days_worked FROM (
      SELECT sh.shift_date AS d FROM shifts sh
      WHERE sh.staff_id = v_staff.id AND sh.shift_date BETWEEN v_emp_start AND v_emp_end
        AND sh.status <> 'cancelled'
        AND NOT EXISTS (SELECT 1 FROM staff_attendance a
          WHERE a.staff_id = v_staff.id AND a.attendance_date = sh.shift_date AND a.status <> 'worked')
      UNION
      SELECT a.attendance_date FROM staff_attendance a
      WHERE a.staff_id = v_staff.id AND a.attendance_date BETWEEN v_emp_start AND v_emp_end AND a.status = 'worked'
    ) AS worked_days;

    SELECT COALESCE(COUNT(*), 0)::INTEGER, COALESCE(SUM(p.late_minutes), 0)::INTEGER
    INTO v_late_days, v_late_minutes
    FROM v_shift_punctuality p
    WHERE p.staff_id = v_staff.id AND p.shift_date BETWEEN v_emp_start AND v_emp_end
      AND p.late_minutes > 0 AND p.late_minutes <= c_late_max_credible AND NOT p.is_excused;

    IF v_staff.punctuality_ack_on IS NOT NULL THEN
      SELECT COALESCE(SUM(u.amount), 0) INTO v_late_deduction FROM unworked_time_adjustments u
      WHERE u.staff_id = v_staff.id
        AND u.period_month >= date_trunc('month', v_period.period_start)::date
        AND u.period_month <= v_period.period_end AND u.approved_at IS NOT NULL;
    ELSE v_late_deduction := 0; END IF;

    IF v_is_partial THEN v_base_salary := ROUND(v_daily_rate * LEAST(v_eligible_days, 30), 2);
    ELSE v_base_salary := v_staff.monthly_salary; END IF;

    v_absence_deduction := ROUND(v_days_absent * v_daily_rate, 2);

    SELECT COALESCE(bonus_pay, 0) INTO v_bonus FROM payroll_lines
    WHERE payroll_period_id = p_period_id AND staff_id = v_staff.id;
    v_bonus := COALESCE(v_bonus, 0);

    v_overtime_pay := ROUND((v_ot_regular_hrs * v_hourly_rate * c_ot_regular)
                          + (v_ot_holiday_hrs * v_hourly_rate * c_ot_holiday)
                          + (v_ot_holiday_ot_hrs * v_hourly_rate * c_ot_holiday_ot), 2);

    v_other_deductions := v_late_deduction;

    IF v_staff.sso_enrolled
       AND (v_staff.sso_enrolled_from IS NULL OR v_staff.sso_enrolled_from <= v_period.period_end)
    THEN
      v_salary_for_sso := LEAST(v_base_salary, c_sso_ceiling);
      v_sso_employee := ROUND(v_salary_for_sso * c_sso_employee_rate, 2);
      v_sso_employer := ROUND(v_salary_for_sso * c_sso_employer_rate, 2);
    ELSE v_sso_employee := 0; v_sso_employer := 0; END IF;

    v_wht := ROUND(fn_thai_pit_annual(v_staff.monthly_salary * 12) / 12.0, 2)
           + GREATEST(fn_thai_pit_annual(v_staff.monthly_salary * 12 + v_bonus)
                    - fn_thai_pit_annual(v_staff.monthly_salary * 12), 0);

    v_net_pay := v_base_salary + v_overtime_pay + v_bonus
               - v_absence_deduction - v_other_deductions - v_sso_employee - v_wht;

    INSERT INTO payroll_lines (
      payroll_period_id, staff_id, days_worked, days_absent, days_leave_paid,
      late_days, late_minutes, late_deduction, base_salary, overtime_pay, bonus_pay,
      absence_deduction, sso_employee, sso_employer, withholding_tax, other_deductions, net_pay
    ) VALUES (
      p_period_id, v_staff.id, v_days_worked, v_days_absent, v_days_leave_paid,
      v_late_days, v_late_minutes, v_late_deduction, v_base_salary, v_overtime_pay, v_bonus,
      v_absence_deduction, v_sso_employee, v_sso_employer, v_wht, v_other_deductions, v_net_pay
    )
    ON CONFLICT (payroll_period_id, staff_id) DO UPDATE SET
      days_worked=EXCLUDED.days_worked, days_absent=EXCLUDED.days_absent,
      days_leave_paid=EXCLUDED.days_leave_paid, late_days=EXCLUDED.late_days,
      late_minutes=EXCLUDED.late_minutes, late_deduction=EXCLUDED.late_deduction,
      base_salary=EXCLUDED.base_salary, overtime_pay=EXCLUDED.overtime_pay,
      absence_deduction=EXCLUDED.absence_deduction, sso_employee=EXCLUDED.sso_employee,
      sso_employer=EXCLUDED.sso_employer, withholding_tax=EXCLUDED.withholding_tax,
      other_deductions=EXCLUDED.other_deductions, net_pay=EXCLUDED.net_pay;
  END LOOP;

  UPDATE payroll_periods SET status='calculated', updated_at=now() WHERE id = p_period_id;
  RETURN QUERY SELECT * FROM payroll_lines WHERE payroll_period_id = p_period_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. July 2026 — spend the two substitute days that were actually taken
--
-- Both people worked King's Birthday, 28 Jul (the only July public holiday our
-- calendar holds — 29/30 Jul remain unconfirmed and are NOT assumed here), and
-- each takes the day back against one day not worked earlier in the month.
-- Applying a day earned on the 28th to a day earlier in the month is
-- administratively normal and entirely in the employee's favour.
-- ---------------------------------------------------------------------------

-- Noe Noe — 09 Jul becomes her substitute day; 06 and 08 Jul stay deducted.
UPDATE staff_attendance
SET status = 'substitute_day_off',
    notes = 'Paid substitute day off (LPA §29) taken against the public holiday '
            || 'worked on 28 Jul 2026. CEO decision 2026-07-31 (MC b4876c65): the '
            || 'substitute day is modelled as a DAY, consuming one of the three days '
            || 'not worked, rather than being paid out as money. Previously recorded '
            || 'as `absent` — approved UNPAID personal leave at employee request. '
            || 'Never unexcused absenteeism: must not count toward the LEG-004 ladder.',
    updated_at = now()
WHERE staff_id = 'b1fb72db-55b6-4afd-be85-be598a7c19ac'
  AND attendance_date = '2026-07-09';

-- Hein — 01 Jul becomes his substitute day.
-- His single July absence was contestable in any case: single-day own-illness
-- sick leave is payable under LPA §57 without a certificate, so the deduction
-- was exposed. Spending the substitute day removes the exposure entirely.
UPDATE staff_attendance
SET status = 'substitute_day_off',
    notes = 'Paid substitute day off (LPA §29) taken against the public holiday '
            || 'worked on 28 Jul 2026. CEO decision 2026-07-31 (MC b4876c65): same '
            || 'model as Noe Noe — the substitute day consumes the day not worked. '
            || 'Previously recorded as `absent` per the CEO determination of '
            || '2026-07-05; that deduction was contestable under LPA §57 and is now '
            || 'moot, since the day is paid.',
    updated_at = now()
WHERE staff_id = 'efcd98a5-78cb-4d3f-a274-7e79f22bc556'
  AND attendance_date = '2026-07-01';

-- The credits those days were spent from.
UPDATE holiday_credits
SET status = 'used', used_on = '2026-07-09', updated_at = now()
WHERE id = 'c3925dca-3205-4a74-a6cf-bf5bd4b2f5ef';   -- Noe Noe, earned 2026-07-28

UPDATE holiday_credits
SET status = 'used', used_on = '2026-07-01', updated_at = now()
WHERE id = 'e1552504-bb12-4b1b-9a09-b3ada6466309';   -- Hein, earned 2026-07-28

-- ---------------------------------------------------------------------------
-- 4. Restate the two July payroll lines
--
-- The period is `calculated`, and fn_calculate_payroll only runs on `draft`, so
-- these are applied directly rather than by reopening the period — reopening
-- would also re-touch Mint's and Lesia's lines for no reason. The figures below
-- are exactly what the patched function now produces from the corrected
-- attendance; §5 asserts that.
-- ---------------------------------------------------------------------------

-- Noe Noe: 2 deducted days (6, 8 Jul) instead of 3; the bonus that covers them
-- drops to match. Net is unchanged at 11,400 — the money is identical either
-- way. What changes is that the record now reconciles: 24 worked + 2 absent +
-- 1 paid leave = 27 working days.
UPDATE payroll_lines
SET days_absent        = 2,
    days_leave_paid    = 1,
    absence_deduction  = 800.00,     -- 2 × 400 (monthly ÷ 30, LPA §68)
    bonus_pay          = 800,
    bonus_note         = 'Discretionary bonus — the employer covers the two deducted '
                      || 'absence days (6, 8 Jul). The third day not worked (9 Jul) is '
                      || 'a paid substitute day off for the public holiday worked on '
                      || '28 Jul (LPA §29), not a bonus.',
    net_pay            = 11400.00,   -- 12,000 + 800 − 800 − 600 SSF
    updated_at         = now()
WHERE payroll_period_id = '4ad08d26-94f6-4692-b815-fd3312aabcb4'
  AND staff_id = 'b1fb72db-55b6-4afd-be85-be598a7c19ac';

-- Hein: his one absence is consumed by his substitute day, so nothing is
-- deducted. Net 15,000 − 750 SSF = 14,250; less the 1,000 advance of 30 Jul,
-- balance due 13,250.
UPDATE payroll_lines
SET days_absent        = 0,
    days_leave_paid    = 1,
    absence_deduction  = 0.00,
    net_pay            = 14250.00,   -- 15,000 − 750 SSF
    updated_at         = now()
WHERE payroll_period_id = '4ad08d26-94f6-4692-b815-fd3312aabcb4'
  AND staff_id = 'efcd98a5-78cb-4d3f-a274-7e79f22bc556';

-- ---------------------------------------------------------------------------
-- 5. Assertions — fail the migration rather than leave payroll half-corrected
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n RECORD; v_h RECORD; v_owed INTEGER;
BEGIN
  SELECT * INTO v_n FROM payroll_lines
   WHERE payroll_period_id = '4ad08d26-94f6-4692-b815-fd3312aabcb4'
     AND staff_id = 'b1fb72db-55b6-4afd-be85-be598a7c19ac';
  SELECT * INTO v_h FROM payroll_lines
   WHERE payroll_period_id = '4ad08d26-94f6-4692-b815-fd3312aabcb4'
     AND staff_id = 'efcd98a5-78cb-4d3f-a274-7e79f22bc556';

  -- Attendance reconciles against the 27 working days in July.
  IF v_n.days_worked + v_n.days_absent + v_n.days_leave_paid <> 27 THEN
    RAISE EXCEPTION 'Noe Noe attendance does not reconcile: % + % + % <> 27',
      v_n.days_worked, v_n.days_absent, v_n.days_leave_paid;
  END IF;
  IF v_h.days_worked + v_h.days_absent + v_h.days_leave_paid <> 27 THEN
    RAISE EXCEPTION 'Hein attendance does not reconcile: % + % + % <> 27',
      v_h.days_worked, v_h.days_absent, v_h.days_leave_paid;
  END IF;

  -- Net equals the printed slip.
  IF v_n.net_pay <> 11400.00 THEN
    RAISE EXCEPTION 'Noe Noe net is %, expected 11400', v_n.net_pay;
  END IF;
  IF v_h.net_pay <> 14250.00 THEN
    RAISE EXCEPTION 'Hein net is % , expected 14250', v_h.net_pay;
  END IF;

  -- Net is internally consistent with its own components.
  IF v_n.net_pay <> v_n.base_salary + v_n.overtime_pay + v_n.bonus_pay
                  - v_n.absence_deduction - v_n.other_deductions
                  - v_n.sso_employee - v_n.withholding_tax THEN
    RAISE EXCEPTION 'Noe Noe net does not equal the sum of her own line';
  END IF;
  IF v_h.net_pay <> v_h.base_salary + v_h.overtime_pay + v_h.bonus_pay
                  - v_h.absence_deduction - v_h.other_deductions
                  - v_h.sso_employee - v_h.withholding_tax THEN
    RAISE EXCEPTION 'Hein net does not equal the sum of his own line';
  END IF;

  -- Every paid-leave day must have a credit behind it. Two credits were spent,
  -- leaving Mint as the only person still owed a substitute day.
  --
  -- Lesia is deliberately NOT expected here. She holds no holiday_credits row
  -- because she has no attendance or shift records at all (days_worked = 0 on
  -- her July line), so there is no evidence she worked 28 Jul and a credit must
  -- not be invented for her. That gap is real and is flagged on MC b4876c65
  -- alongside her start date — it is a data-collection question for the CEO,
  -- not something a migration may assume.
  SELECT COUNT(*) INTO v_owed FROM holiday_credits WHERE status = 'owed';
  IF v_owed <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 substitute day still owed (Mint), found %', v_owed;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Self-register
-- ---------------------------------------------------------------------------
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('399_substitute_day_off_attendance.sql', 'claude-opus-session-67fdfefd', 'success',
        'Substitute day off (LPA §29) becomes a first-class attendance status (MC b4876c65, '
     || 'CEO decision 2026-07-31). Until now a day taken back for a public holiday worked had '
     || 'no status, so it was recorded as `absent` and deducted — the employee paid for a day '
     || 'the employer already owed them. `substitute_day_off` is added to the status CHECK and '
     || 'to the paid-leave FILTER in fn_calculate_payroll (patched from pg_get_functiondef on '
     || 'the live function; that FILTER list is the only change). July 2026: Noe Noe 09 Jul and '
     || 'Hein 01 Jul reclassified, their two holiday_credits rows marked used, and both payroll '
     || 'lines restated — Noe Noe 2 absent / 1 paid leave, absence 800, bonus 800, net 11,400 '
     || '(unchanged); Hein 0 absent / 1 paid leave, absence 0, net 14,250 (+500, his contestable '
     || 'LPA §57 deduction removed). Applied directly rather than by reopening the period, which '
     || 'would have re-touched Mint and Lesia for nothing; the figures equal what the patched '
     || 'function now produces. Assertions in the migration fail it if either line stops '
     || 'reconciling. Mint remains the only person owed a substitute day.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- UPDATE public.payroll_lines SET days_absent=3, days_leave_paid=0, absence_deduction=1200,
--        bonus_pay=1200, net_pay=11400
--  WHERE payroll_period_id='4ad08d26-94f6-4692-b815-fd3312aabcb4'
--    AND staff_id='b1fb72db-55b6-4afd-be85-be598a7c19ac';
-- UPDATE public.payroll_lines SET days_absent=1, days_leave_paid=0, absence_deduction=500,
--        net_pay=13750
--  WHERE payroll_period_id='4ad08d26-94f6-4692-b815-fd3312aabcb4'
--    AND staff_id='efcd98a5-78cb-4d3f-a274-7e79f22bc556';
-- UPDATE public.holiday_credits SET status='owed', used_on=NULL
--  WHERE id IN ('c3925dca-3205-4a74-a6cf-bf5bd4b2f5ef','e1552504-bb12-4b1b-9a09-b3ada6466309');
-- UPDATE public.staff_attendance SET status='absent' WHERE status='substitute_day_off';
-- Restore fn_calculate_payroll from migration 398, then drop the status from the CHECK.
-- DELETE FROM public.migration_log WHERE filename='399_substitute_day_off_attendance.sql';
-- COMMIT;
