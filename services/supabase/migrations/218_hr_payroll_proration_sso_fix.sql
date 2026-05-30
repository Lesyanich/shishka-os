-- ============================================================
-- Migration 218: fn_calculate_payroll defect fixes
-- MC task: eea6c129 (surfaced by payslip task 0a3b7e69)
-- Supersedes the fn_calculate_payroll body from migration 169.
--   (169 is NOT edited in place; this CREATE OR REPLACE wins.)
--
-- Fixes three issues, all verified against Thai Labour Protection
-- Act B.E. 2541 and finance WF-7 (agents/finance/AGENT.md):
--
--   1. SSO/SSF was deducted for ALL salaried staff. Thai SSO only
--      applies to ENROLLED employees -> now gated on sso_number
--      IS NOT NULL. Unenrolled Myanmar staff (Alex/Hein/Nono, null
--      sso_number) get sso_employee = sso_employer = 0.
--
--   2. No hire_date / fire_date pro-ration. A mid-month joiner was
--      paid a full monthly base. Now pro-rated by the Thai 30-day
--      rule: base = (monthly_salary / 30) * eligible_days_employed,
--      where eligible_days is CALENDAR days from max(hire_date,
--      period_start) to min(fire_date|period_end, period_end),
--      capped at 30. Full-month employees are NOT pro-rated.
--
--   3. Daily-rate divisor was working-days (Mon-Sat minus holidays).
--      Thai LPA uses a FIXED 30-day divisor for monthly-salaried
--      staff (daily = monthly/30; hourly = monthly/(30*8)). This is
--      what unpaid-absence deductions and OT now use.
--
-- Staff eligibility loop changed from `is_active = true` to a
-- date-range employment-overlap test so that mid-month leavers are
-- included for their pro-rated final pay (fire_date proration cannot
-- work otherwise — a fired employee has is_active = false by the time
-- payroll runs).
--
-- NOTE: only recomputes DRAFT periods. Already-approved periods
-- (e.g. posted May 2026) are untouched. Going-forward numbers use
-- the /30 rule and will differ slightly from the manually-written
-- May register (which used /31): Alex 14,000 vs 14,032, Nono 6,800
-- vs 6,581. This divergence is the law-compliant behavior.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_calculate_payroll(p_period_id UUID)
RETURNS SETOF payroll_lines
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period         RECORD;
  v_staff          RECORD;
  v_emp_start      DATE;
  v_emp_end        DATE;
  v_eligible_days  INTEGER;
  v_is_partial     BOOLEAN;
  v_daily_rate     NUMERIC;
  v_hourly_rate    NUMERIC;
  v_days_worked    INTEGER;
  v_days_absent    INTEGER;
  v_days_leave_paid INTEGER;
  v_ot_regular_hrs NUMERIC;
  v_ot_holiday_hrs NUMERIC;
  v_ot_holiday_ot_hrs NUMERIC;
  v_base_salary    NUMERIC;
  v_absence_deduction NUMERIC;
  v_overtime_pay   NUMERIC;
  v_salary_for_sso NUMERIC;
  v_sso_employee   NUMERIC;
  v_sso_employer   NUMERIC;
  v_net_pay        NUMERIC;
  -- Config values
  c_sso_employee_rate NUMERIC;
  c_sso_employer_rate NUMERIC;
  c_sso_ceiling    NUMERIC;
  c_ot_regular     NUMERIC;
  c_ot_holiday     NUMERIC;
  c_ot_holiday_ot  NUMERIC;
BEGIN
  -- Get and validate period
  SELECT * INTO v_period
  FROM payroll_periods
  WHERE id = p_period_id AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period % not found or not in draft status', p_period_id;
  END IF;

  -- Load config
  SELECT value INTO c_sso_employee_rate FROM payroll_config WHERE key = 'sso_employee_rate';
  SELECT value INTO c_sso_employer_rate FROM payroll_config WHERE key = 'sso_employer_rate';
  SELECT value INTO c_sso_ceiling       FROM payroll_config WHERE key = 'sso_ceiling_thb';
  SELECT value INTO c_ot_regular        FROM payroll_config WHERE key = 'ot_multiplier_regular';
  SELECT value INTO c_ot_holiday        FROM payroll_config WHERE key = 'ot_multiplier_holiday';
  SELECT value INTO c_ot_holiday_ot     FROM payroll_config WHERE key = 'ot_multiplier_holiday_ot';

  -- Process each staff member whose employment OVERLAPS this period.
  -- (Date-range test, not is_active: a mid-month leaver is is_active=false
  --  by payroll time but is still owed pro-rated final pay.)
  FOR v_staff IN
    SELECT id, name, monthly_salary, hire_date, fire_date, sso_number
    FROM staff
    WHERE monthly_salary IS NOT NULL
      AND hire_date IS NOT NULL
      AND hire_date <= v_period.period_end
      AND (fire_date IS NULL OR fire_date >= v_period.period_start)
  LOOP
    -- Thai LPA 30-day rule: fixed divisor regardless of month length.
    v_daily_rate  := v_staff.monthly_salary / 30.0;
    v_hourly_rate := v_daily_rate / 8.0;

    -- Employment window clipped to the period.
    v_emp_start := GREATEST(v_staff.hire_date, v_period.period_start);
    v_emp_end   := LEAST(COALESCE(v_staff.fire_date, v_period.period_end), v_period.period_end);
    v_eligible_days := (v_emp_end - v_emp_start) + 1;  -- inclusive calendar days
    IF v_eligible_days < 0 THEN
      v_eligible_days := 0;
    END IF;

    -- Partial month iff hired after the period start or fired before the period end.
    v_is_partial := (v_staff.hire_date > v_period.period_start)
                 OR (v_staff.fire_date IS NOT NULL AND v_staff.fire_date < v_period.period_end);

    -- Attendance aggregates (window-bounded by attendance_date anyway)
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE status = 'worked'), 0)::INTEGER,
      COALESCE(COUNT(*) FILTER (WHERE status = 'absent'), 0)::INTEGER,
      COALESCE(COUNT(*) FILTER (WHERE status IN ('sick_leave', 'annual_leave', 'personal_leave', 'maternity_leave', 'paternity_leave')), 0)::INTEGER,
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'regular'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday_ot'), 0)
    INTO v_days_worked, v_days_absent, v_days_leave_paid,
         v_ot_regular_hrs, v_ot_holiday_hrs, v_ot_holiday_ot_hrs
    FROM staff_attendance
    WHERE staff_id = v_staff.id
      AND attendance_date BETWEEN v_period.period_start AND v_period.period_end;

    -- Base salary: full month, or pro-rated by eligible calendar days
    -- capped at 30 so a full 31-day month never exceeds monthly_salary.
    IF v_is_partial THEN
      v_base_salary := ROUND(v_daily_rate * LEAST(v_eligible_days, 30), 2);
    ELSE
      v_base_salary := v_staff.monthly_salary;
    END IF;

    -- Unpaid-absence deduction at the 30-day daily rate.
    v_absence_deduction := ROUND(v_days_absent * v_daily_rate, 2);

    v_overtime_pay := ROUND(
                        (v_ot_regular_hrs   * v_hourly_rate * c_ot_regular)
                      + (v_ot_holiday_hrs   * v_hourly_rate * c_ot_holiday)
                      + (v_ot_holiday_ot_hrs * v_hourly_rate * c_ot_holiday_ot), 2);

    -- SSO/SSF: only for ENROLLED staff (sso_number present).
    IF v_staff.sso_number IS NOT NULL THEN
      v_salary_for_sso := LEAST(v_base_salary, c_sso_ceiling);
      v_sso_employee   := ROUND(v_salary_for_sso * c_sso_employee_rate, 2);
      v_sso_employer   := ROUND(v_salary_for_sso * c_sso_employer_rate, 2);
    ELSE
      v_sso_employee := 0;
      v_sso_employer := 0;
    END IF;

    -- Net pay
    v_net_pay := v_base_salary + v_overtime_pay - v_absence_deduction - v_sso_employee;

    -- Upsert payroll line
    INSERT INTO payroll_lines (
      payroll_period_id, staff_id,
      days_worked, days_absent, days_leave_paid,
      base_salary, overtime_pay, absence_deduction,
      sso_employee, sso_employer,
      withholding_tax, other_deductions, net_pay
    ) VALUES (
      p_period_id, v_staff.id,
      v_days_worked, v_days_absent, v_days_leave_paid,
      v_base_salary, v_overtime_pay, v_absence_deduction,
      v_sso_employee, v_sso_employer,
      0, 0, v_net_pay
    )
    ON CONFLICT (payroll_period_id, staff_id) DO UPDATE SET
      days_worked       = EXCLUDED.days_worked,
      days_absent       = EXCLUDED.days_absent,
      days_leave_paid   = EXCLUDED.days_leave_paid,
      base_salary       = EXCLUDED.base_salary,
      overtime_pay      = EXCLUDED.overtime_pay,
      absence_deduction = EXCLUDED.absence_deduction,
      sso_employee      = EXCLUDED.sso_employee,
      sso_employer      = EXCLUDED.sso_employer,
      withholding_tax   = EXCLUDED.withholding_tax,
      other_deductions  = EXCLUDED.other_deductions,
      net_pay           = EXCLUDED.net_pay;
  END LOOP;

  -- Update period status
  UPDATE payroll_periods
  SET status = 'calculated', updated_at = now()
  WHERE id = p_period_id;

  -- Return calculated lines
  RETURN QUERY
  SELECT * FROM payroll_lines WHERE payroll_period_id = p_period_id;
END;
$$;

-- ============================================================
-- Self-register in migration_log
-- ============================================================

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '218_hr_payroll_proration_sso_fix.sql',
  'claude-code',
  NULL,
  'fn_calculate_payroll fixes: SSO gated on sso_number, Thai 30-day proration (hire/fire), date-overlap staff loop. MC eea6c129, supersedes 169 body.'
)
ON CONFLICT DO NOTHING;

COMMIT;
