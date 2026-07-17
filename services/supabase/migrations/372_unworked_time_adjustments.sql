-- 372_unworked_time_adjustments.sql
-- Approved late minutes reach the payslip as "hours not worked".
--
-- CEO decision (2026-07-17): the suggested value stops being a dashboard
-- curiosity and becomes a real payslip line — but ONLY after the owner
-- approves it for that month. Nothing here is automatic: no row, no effect.
--
-- Legality (LEG-004 §3): this is not a LPA §76 deduction and not a fine. Wage
-- is simply not earned for minutes not worked; the value is the employee's own
-- rate (monthly_salary / 30 days / 9 hours), and excused minutes never get
-- here (they are filtered out upstream in v_shift_punctuality.is_excused).
--
-- fn_calculate_payroll changes in exactly one respect: `other_deductions` --
-- which the function itself has always written as a literal 0 -- now carries
-- the approved amount and is subtracted in net_pay. (One legacy non-zero value
-- exists, Pa / Apr 2026, written outside the function; paid periods are never
-- recalculated -- the fn only touches periods in `draft` -- so it is safe.) Every other rule — deduct only full `absent` days at
-- monthly_salary/30 per LPA §68, never touch sick/personal/annual leave —
-- is untouched. Payslip.tsx already renders the column.
--
-- !! The body below is copied from the LIVE function (pg_get_functiondef on
-- prod), NOT from repo mig 171a — the two have drifted badly. Live carries
-- hire/fire pro-rating, the sso_number enrolment check, the draft-status
-- guard, and config keys named ot_multiplier_* (171a reads ot_*_multiplier,
-- which would silently resolve to NULL and NULL out net_pay). Anyone touching
-- this function again: re-read the live definition first, never the repo copy.

CREATE TABLE IF NOT EXISTS unworked_time_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES staff(id),
  period_month  date NOT NULL,
  late_minutes  int NOT NULL CHECK (late_minutes > 0),
  amount        numeric NOT NULL CHECK (amount >= 0),
  note          text,
  approved_by   uuid REFERENCES staff(id),
  approved_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, period_month)
);

COMMENT ON TABLE unworked_time_adjustments IS
  'Owner-approved value of unworked (late) minutes for one staff-month. Feeds payroll_lines.other_deductions. No row = no effect; nothing writes here automatically (LEG-004 §3).';

ALTER TABLE unworked_time_adjustments ENABLE ROW LEVEL SECURITY;

-- Read: the employee sees their own (it is their pay); owners see all.
DROP POLICY IF EXISTS unworked_time_select ON unworked_time_adjustments;
CREATE POLICY unworked_time_select ON unworked_time_adjustments
  FOR SELECT
  USING (
    staff_id = (SELECT r.staff_id FROM fn_get_my_role() r)
    OR (SELECT r.app_role FROM fn_get_my_role() r) = 'owner'
  );

-- Write: owners only — this moves money.
DROP POLICY IF EXISTS unworked_time_insert ON unworked_time_adjustments;
CREATE POLICY unworked_time_insert ON unworked_time_adjustments
  FOR INSERT WITH CHECK ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

DROP POLICY IF EXISTS unworked_time_update ON unworked_time_adjustments;
CREATE POLICY unworked_time_update ON unworked_time_adjustments
  FOR UPDATE USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

DROP POLICY IF EXISTS unworked_time_delete ON unworked_time_adjustments;
CREATE POLICY unworked_time_delete ON unworked_time_adjustments
  FOR DELETE USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

GRANT SELECT, INSERT, UPDATE, DELETE ON unworked_time_adjustments TO authenticated;

-- fn_calculate_payroll: pick up the approved adjustment for the period.
-- Verbatim copy of the LIVE definition with four changes, marked <<UNWORKED>>:
--   1. declare v_other_deductions
--   2. look up the owner-approved amount for the period
--   3. subtract it in net_pay
--   4. write it into payroll_lines.other_deductions (was a literal 0)
CREATE OR REPLACE FUNCTION public.fn_calculate_payroll(p_period_id uuid)
 RETURNS SETOF payroll_lines
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_other_deductions NUMERIC;   -- <<UNWORKED>> 1
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

    -- <<UNWORKED>> 2 — owner-approved value of late minutes for the month(s)
    -- this period covers. No row (the default) = 0 = behaviour unchanged.
    SELECT COALESCE(SUM(a.amount), 0)
    INTO v_other_deductions
    FROM unworked_time_adjustments a
    WHERE a.staff_id = v_staff.id
      AND a.period_month >= date_trunc('month', v_period.period_start)::date
      AND a.period_month <= v_period.period_end;

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

    -- Net pay  (<<UNWORKED>> 3 — minus the approved unworked time)
    v_net_pay := v_base_salary + v_overtime_pay - v_absence_deduction
               - v_other_deductions - v_sso_employee;

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
      0, v_other_deductions, v_net_pay   -- <<UNWORKED>> 4
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
$function$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '372_unworked_time_adjustments.sql',
  'claude-code',
  NULL,
  'unworked_time_adjustments (owner-approved late-minute value) + fn_calculate_payroll carries it in other_deductions/net_pay; copied from LIVE fn (repo 171a has drifted); absent-day rule unchanged (LEG-004 3, task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
