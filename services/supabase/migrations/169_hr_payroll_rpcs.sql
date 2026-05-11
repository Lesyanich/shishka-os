-- ============================================================
-- Migration 169: HR & Payroll RPCs
-- fn_calculate_payroll + fn_approve_payroll
-- MC task: b37717ca, parent initiative: 24e6ae48
-- ============================================================

BEGIN;

-- ============================================================
-- RPC 1: fn_calculate_payroll
-- Computes payroll_lines from attendance × config for a draft period
-- ============================================================

CREATE OR REPLACE FUNCTION fn_calculate_payroll(p_period_id UUID)
RETURNS SETOF payroll_lines
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period         RECORD;
  v_staff          RECORD;
  v_working_days   INTEGER;
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

  -- Process each eligible staff member
  FOR v_staff IN
    SELECT id, name, monthly_salary
    FROM staff
    WHERE is_active = true
      AND monthly_salary IS NOT NULL
  LOOP
    -- Count working days (Mon-Sat) minus public holidays in period
    SELECT COUNT(*)::INTEGER INTO v_working_days
    FROM generate_series(v_period.period_start, v_period.period_end, '1 day'::INTERVAL) d(dt)
    WHERE EXTRACT(DOW FROM d.dt) BETWEEN 1 AND 6  -- Mon=1 .. Sat=6
      AND d.dt::DATE NOT IN (
        SELECT holiday_date FROM public_holidays
        WHERE holiday_date BETWEEN v_period.period_start AND v_period.period_end
          AND EXTRACT(DOW FROM holiday_date) BETWEEN 1 AND 6
      );

    -- Avoid division by zero
    IF v_working_days = 0 THEN
      v_working_days := 1;
    END IF;

    v_daily_rate  := v_staff.monthly_salary / v_working_days;
    v_hourly_rate := v_daily_rate / 8;

    -- Attendance aggregates
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

    -- Calculations
    v_base_salary       := v_staff.monthly_salary;
    v_absence_deduction := v_days_absent * v_daily_rate;
    v_overtime_pay      := (v_ot_regular_hrs * v_hourly_rate * c_ot_regular)
                         + (v_ot_holiday_hrs * v_hourly_rate * c_ot_holiday)
                         + (v_ot_holiday_ot_hrs * v_hourly_rate * c_ot_holiday_ot);

    -- SSO with ceiling
    v_salary_for_sso := LEAST(v_base_salary, c_sso_ceiling);
    v_sso_employee   := ROUND(v_salary_for_sso * c_sso_employee_rate, 2);
    v_sso_employer   := ROUND(v_salary_for_sso * c_sso_employer_rate, 2);

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
-- RPC 2: fn_approve_payroll
-- Marks period as approved + auto-creates expense_ledger entries
-- ============================================================

CREATE OR REPLACE FUNCTION fn_approve_payroll(
  p_period_id UUID,
  p_approved_by TEXT DEFAULT 'lesia'
)
RETURNS SETOF payroll_periods
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period           RECORD;
  v_line             RECORD;
  v_expense_id       UUID;
  v_staff_name       TEXT;
  v_total_sso_employer NUMERIC := 0;
  v_total_overtime   NUMERIC := 0;
BEGIN
  -- Get and validate period
  SELECT * INTO v_period
  FROM payroll_periods
  WHERE id = p_period_id AND status = 'calculated';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period % not found or not in calculated status', p_period_id;
  END IF;

  -- Process each payroll line
  FOR v_line IN
    SELECT pl.*, s.name AS staff_name
    FROM payroll_lines pl
    JOIN staff s ON s.id = pl.staff_id
    WHERE pl.payroll_period_id = p_period_id
  LOOP
    -- Create salary expense_ledger entry
    INSERT INTO expense_ledger (
      transaction_date, flow_type,
      category_code, sub_category_code,
      details, amount_original, currency,
      paid_by, payment_method, status
    ) VALUES (
      v_period.period_end, 'OpEx',
      2600, 2601,
      format('Salary: %s (%s to %s)', v_line.staff_name, v_period.period_start, v_period.period_end),
      v_line.net_pay, 'THB',
      p_approved_by, 'transfer', 'paid'
    )
    RETURNING id INTO v_expense_id;

    -- Link payroll line to expense
    UPDATE payroll_lines
    SET expense_ledger_id = v_expense_id
    WHERE id = v_line.id;

    -- Accumulate totals
    v_total_sso_employer := v_total_sso_employer + v_line.sso_employer;
    v_total_overtime     := v_total_overtime + v_line.overtime_pay;
  END LOOP;

  -- SSO employer contribution (single entry)
  IF v_total_sso_employer > 0 THEN
    INSERT INTO expense_ledger (
      transaction_date, flow_type,
      category_code, sub_category_code,
      details, amount_original, currency,
      paid_by, payment_method, status
    ) VALUES (
      v_period.period_end, 'OpEx',
      2600, 2603,
      format('Social Security employer contribution (%s to %s)', v_period.period_start, v_period.period_end),
      v_total_sso_employer, 'THB',
      p_approved_by, 'transfer', 'paid'
    );
  END IF;

  -- Overtime pay (single entry)
  IF v_total_overtime > 0 THEN
    INSERT INTO expense_ledger (
      transaction_date, flow_type,
      category_code, sub_category_code,
      details, amount_original, currency,
      paid_by, payment_method, status
    ) VALUES (
      v_period.period_end, 'OpEx',
      2600, 2604,
      format('Overtime pay (%s to %s)', v_period.period_start, v_period.period_end),
      v_total_overtime, 'THB',
      p_approved_by, 'transfer', 'paid'
    );
  END IF;

  -- Mark period as approved
  UPDATE payroll_periods
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_period_id;

  -- Return updated period
  RETURN QUERY
  SELECT * FROM payroll_periods WHERE id = p_period_id;
END;
$$;

-- ============================================================
-- Self-register in migration_log
-- ============================================================

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '169_hr_payroll_rpcs.sql',
  'claude-code',
  NULL,
  'Payroll RPCs: fn_calculate_payroll (attendance->lines), fn_approve_payroll (lines->expense_ledger). MC b37717ca, parent 24e6ae48'
)
ON CONFLICT DO NOTHING;

COMMIT;
