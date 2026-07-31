-- 396_hr_phase1_payroll_spine.sql
-- MC task: 679e41d4-defb-43cc-bfa5-3b6da0d11c39 (Phase 1 of the HR/payroll re-plan)
-- Spec: docs/plans/spec-hr-payroll-process.md § Part IV Phase 1
--       docs/plans/spec-payslip-data-contract.md § 3, § 6
--
-- Phase 0 (mig 395) fixed the reference data. This one fixes the machine.
--
-- WHAT WAS WRONG. Seven defects, all confirmed against prod on 2026-07-31:
--
--  1. days_worked counted only explicit staff_attendance rows with status
--     'worked'. Nobody logs attendance daily, so July read 0 for everyone while
--     104 shifts sat in `shifts`. The schedule and the payroll never spoke.
--  2. There was no bonus column. Bonuses were shoehorned into overtime_pay
--     (April's holiday bonus, June's offset for Nono) — which then double-booked
--     into the ledger, see 6.
--  3. ON CONFLICT DO UPDATE overwrote every money column, so any hand-entered
--     adjustment was destroyed by the next recalc. `notes` was NOT in the update
--     list, so a stale note survived describing numbers that no longer existed.
--  4. SSO was skipped whenever staff.sso_number IS NULL — NULL for all four
--     employees while the company has been a registered employer since
--     2026-06-01. Presence of a number is also the wrong switch: June is
--     retroactive, and filling the number today must not restate May.
--  5. withholding_tax was a hardcoded literal 0 with no computation behind it.
--     The correct figure today genuinely IS 0 at every current salary — but only
--     because everyone sits under the threshold, and Mint at 25,000/mo is about
--     one raise from a non-zero number.
--  6. fn_approve_payroll booked net_pay per line AND a separate 2604 row for the
--     period's overtime — but net_pay already contains overtime. April 2026 is
--     overstated by 4,000 THB in expense_ledger as a result. It also hardcoded
--     payment_method='transfer' for salaries that are paid in cash.
--  7. Nothing modelled a second payment in a month, so an advance or a split
--     salary was impossible.
--
-- THE PUNCTUALITY RULE THIS ENCODES. LEG-004 and LPA s.76: only *unworked time*
-- may be deducted, never a fine. Three gates, all of which must pass before a
-- single baht is withheld for lateness:
--   (a) the employee signed the acknowledgement  -> staff.punctuality_ack_on
--   (b) the late was not excused                 -> v_shift_punctuality.is_excused
--   (c) the owner approved the amount            -> unworked_time_adjustments
-- late_days and late_minutes are recorded on every line regardless, because the
-- CEO wants to SEE lateness on the payslip even in a month where nothing is
-- deducted. Visibility is not enforcement.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS bonus_pay          NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_note         TEXT,
  ADD COLUMN IF NOT EXISTS late_days          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction     NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payroll_lines.bonus_pay IS
  'Discretionary bonus, entered by hand. Survives recalculation — never written by fn_calculate_payroll.';
COMMENT ON COLUMN public.payroll_lines.late_days IS
  'Informational: days with an unexcused late arrival. Recorded even when nothing is deducted.';
COMMENT ON COLUMN public.payroll_lines.late_deduction IS
  'Value of unworked late minutes, and only where all three LEG-004 gates pass. Never a fine.';
COMMENT ON COLUMN public.payroll_lines.is_manual_override IS
  'When true, fn_calculate_payroll leaves this line completely alone.';

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS sso_enrolled_from DATE,
  ADD COLUMN IF NOT EXISTS date_of_birth     DATE,
  ADD COLUMN IF NOT EXISTS address           TEXT,
  ADD COLUMN IF NOT EXISTS legal_name_first  TEXT,
  ADD COLUMN IF NOT EXISTS legal_name_last   TEXT;

COMMENT ON COLUMN public.staff.sso_enrolled_from IS
  'Date SSO contributions start for this person. The switch for deductions — NOT sso_number, '
  'because a number filled in today must not retroactively restate closed months.';

ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS punctuality_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS punctuality_reviewed_by TEXT;

COMMENT ON COLUMN public.payroll_periods.punctuality_reviewed_at IS
  'Set when the owner has reviewed every unexcused late in the period. fn_approve_payroll '
  'refuses while this is NULL and enforceable lates exist (CEO 2026-07-31: lates are approved '
  'at period close).';

CREATE TABLE IF NOT EXISTS public.staff_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID NOT NULL REFERENCES public.staff(id),
  payroll_period_id UUID NOT NULL REFERENCES public.payroll_periods(id),
  paid_on           DATE NOT NULL,
  amount            NUMERIC NOT NULL CHECK (amount > 0),
  kind              TEXT NOT NULL DEFAULT 'advance'
                    CHECK (kind IN ('advance', 'final', 'correction')),
  payment_method    TEXT NOT NULL DEFAULT 'cash',
  note              TEXT,
  expense_ledger_id UUID REFERENCES public.expense_ledger(id),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_payments IS
  'One row per cash-out event. payroll_lines.net_pay stays the monthly ENTITLEMENT; this table '
  'records what was actually handed over and when. An advance is not a deduction — it never '
  'touches gross, the SSO base or the tax base. Legal boundary (LPA s.70): this must stay a wage '
  'advance, not a loan — never advance more than the wage accrued to date, or recovering it from '
  'later wages runs into s.76.';

CREATE INDEX IF NOT EXISTS idx_staff_payments_period ON public.staff_payments(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_staff_payments_staff  ON public.staff_payments(staff_id);

ALTER TABLE public.staff_payments ENABLE ROW LEVEL SECURITY;

-- Money movement: owner writes, employee sees only their own.
-- Copies the unworked_time_adjustments pattern (mig 372), not the flat one.
DROP POLICY IF EXISTS staff_payments_select ON public.staff_payments;
DROP POLICY IF EXISTS staff_payments_insert ON public.staff_payments;
DROP POLICY IF EXISTS staff_payments_update ON public.staff_payments;
DROP POLICY IF EXISTS staff_payments_delete ON public.staff_payments;

CREATE POLICY staff_payments_select ON public.staff_payments FOR SELECT
  USING (
    staff_id = (SELECT r.staff_id FROM fn_get_my_role() r)
    OR (SELECT r.app_role FROM fn_get_my_role() r) = 'owner'
  );
CREATE POLICY staff_payments_insert ON public.staff_payments FOR INSERT
  WITH CHECK ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');
CREATE POLICY staff_payments_update ON public.staff_payments FOR UPDATE
  USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');
CREATE POLICY staff_payments_delete ON public.staff_payments FOR DELETE
  USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

-- ---------------------------------------------------------------------------
-- 1b. Credible-lateness threshold
-- ---------------------------------------------------------------------------
-- Guards against the payslip asserting something untrue about a person.

INSERT INTO public.payroll_config (key, value, description)
VALUES ('late_max_credible_minutes', 180,
        'A clock-in later than this many minutes after shift start is NOT counted as a late '
     || 'arrival. Punching in 6 hours into a 9-hour shift is a missed punch, not a 6-hour late '
     || 'arrival. July 2026 data proves the case: recorded "arrivals" at 15:49, 18:30 and 20:10 '
     || 'against a 09:30 shift. Such punches are excluded from late_days/late_minutes and are a '
     || 'data-quality problem, not a discipline one.')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Thai personal income tax
-- ---------------------------------------------------------------------------
-- Revenue Code s.40(1) employment income: 50% expense deduction capped at
-- 100,000, personal allowance 60,000, then the progressive ladder. Returns the
-- ANNUAL liability; the caller divides for monthly withholding.
--
-- At today's salaries this returns 0 for everyone — 25,000/mo gives
-- 300,000 - 100,000 - 60,000 = 140,000 net taxable, under the 150,000 exempt
-- band. That is the correct answer, and the point of computing it rather than
-- hardcoding a zero is that it stays correct after a raise. Break-even is around
-- 26,000/mo.

CREATE OR REPLACE FUNCTION public.fn_thai_pit_annual(p_annual_income NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_expenses  NUMERIC;
  v_taxable   NUMERIC;
  v_tax       NUMERIC := 0;
BEGIN
  IF p_annual_income IS NULL OR p_annual_income <= 0 THEN
    RETURN 0;
  END IF;

  v_expenses := LEAST(p_annual_income * 0.50, 100000);
  v_taxable  := GREATEST(p_annual_income - v_expenses - 60000, 0);

  -- Progressive bands, each applied only to the slice that falls inside it.
  v_tax := v_tax + GREATEST(LEAST(v_taxable,  300000) -  150000, 0) * 0.05;
  v_tax := v_tax + GREATEST(LEAST(v_taxable,  500000) -  300000, 0) * 0.10;
  v_tax := v_tax + GREATEST(LEAST(v_taxable,  750000) -  500000, 0) * 0.15;
  v_tax := v_tax + GREATEST(LEAST(v_taxable, 1000000) -  750000, 0) * 0.20;
  v_tax := v_tax + GREATEST(LEAST(v_taxable, 2000000) - 1000000, 0) * 0.25;
  v_tax := v_tax + GREATEST(LEAST(v_taxable, 5000000) - 2000000, 0) * 0.30;
  v_tax := v_tax + GREATEST(v_taxable - 5000000, 0) * 0.35;

  RETURN ROUND(v_tax, 2);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. fn_calculate_payroll v3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_calculate_payroll(p_period_id uuid)
RETURNS SETOF payroll_lines
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_period            RECORD;
  v_staff             RECORD;
  v_emp_start         DATE;
  v_emp_end           DATE;
  v_eligible_days     INTEGER;
  v_is_partial        BOOLEAN;
  v_daily_rate        NUMERIC;
  v_hourly_rate       NUMERIC;
  v_minute_rate       NUMERIC;
  v_days_worked       INTEGER;
  v_days_absent       INTEGER;
  v_days_leave_paid   INTEGER;
  v_late_days         INTEGER;
  v_late_minutes      INTEGER;
  v_late_deduction    NUMERIC;
  v_ot_regular_hrs    NUMERIC;
  v_ot_holiday_hrs    NUMERIC;
  v_ot_holiday_ot_hrs NUMERIC;
  v_base_salary       NUMERIC;
  v_bonus             NUMERIC;
  v_absence_deduction NUMERIC;
  v_other_deductions  NUMERIC;
  v_overtime_pay      NUMERIC;
  v_salary_for_sso    NUMERIC;
  v_sso_employee      NUMERIC;
  v_sso_employer      NUMERIC;
  v_wht               NUMERIC;
  v_net_pay           NUMERIC;
  c_sso_employee_rate NUMERIC;
  c_sso_employer_rate NUMERIC;
  c_sso_ceiling       NUMERIC;
  c_ot_regular        NUMERIC;
  c_ot_holiday        NUMERIC;
  c_ot_holiday_ot     NUMERIC;
  c_late_max_credible NUMERIC;
BEGIN
  SELECT * INTO v_period
  FROM payroll_periods
  WHERE id = p_period_id AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period % not found or not in draft status', p_period_id;
  END IF;

  SELECT value INTO c_sso_employee_rate FROM payroll_config WHERE key = 'sso_employee_rate';
  SELECT value INTO c_sso_employer_rate FROM payroll_config WHERE key = 'sso_employer_rate';
  SELECT value INTO c_sso_ceiling       FROM payroll_config WHERE key = 'sso_ceiling_thb';
  SELECT value INTO c_ot_regular        FROM payroll_config WHERE key = 'ot_multiplier_regular';
  SELECT value INTO c_ot_holiday        FROM payroll_config WHERE key = 'ot_multiplier_holiday';
  SELECT value INTO c_ot_holiday_ot     FROM payroll_config WHERE key = 'ot_multiplier_holiday_ot';
  SELECT value INTO c_late_max_credible FROM payroll_config WHERE key = 'late_max_credible_minutes';
  c_late_max_credible := COALESCE(c_late_max_credible, 180);

  FOR v_staff IN
    SELECT id, name, monthly_salary, hire_date, fire_date,
           sso_enrolled_from, punctuality_ack_on
    FROM staff
    WHERE monthly_salary IS NOT NULL
      AND hire_date IS NOT NULL
      AND hire_date <= v_period.period_end
      AND (fire_date IS NULL OR fire_date >= v_period.period_start)
  LOOP
    -- A line the owner has taken control of is never recomputed.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_lines
      WHERE payroll_period_id = p_period_id
        AND staff_id = v_staff.id
        AND is_manual_override
    );

    v_daily_rate  := v_staff.monthly_salary / 30.0;   -- LPA s.68, fixed 30
    v_hourly_rate := v_daily_rate / 8.0;
    v_minute_rate := v_hourly_rate / 60.0;

    v_emp_start := GREATEST(v_staff.hire_date, v_period.period_start);
    v_emp_end   := LEAST(COALESCE(v_staff.fire_date, v_period.period_end), v_period.period_end);
    v_eligible_days := GREATEST((v_emp_end - v_emp_start) + 1, 0);

    v_is_partial := (v_staff.hire_date > v_period.period_start)
                 OR (v_staff.fire_date IS NOT NULL AND v_staff.fire_date < v_period.period_end);

    -- ---- attendance exceptions (the log of what did NOT go to plan) --------
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE status = 'absent'), 0)::INTEGER,
      COALESCE(COUNT(*) FILTER (WHERE status IN ('sick_leave','annual_leave','personal_leave',
                                                 'maternity_leave','paternity_leave')), 0)::INTEGER,
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'regular'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday_ot'), 0)
    INTO v_days_absent, v_days_leave_paid,
         v_ot_regular_hrs, v_ot_holiday_hrs, v_ot_holiday_ot_hrs
    FROM staff_attendance
    WHERE staff_id = v_staff.id
      AND attendance_date BETWEEN v_emp_start AND v_emp_end;

    -- ---- days worked: THE SCHEDULE IS THE DEFAULT -------------------------
    -- A scheduled shift counts as a full worked day unless an exception row
    -- overrides it. Bounded by employment dates so a departed employee cannot
    -- be paid for shifts dated after their fire_date. Plus any explicitly
    -- 'worked' day that had no shift, so ad-hoc cover still counts.
    SELECT COUNT(*)::INTEGER INTO v_days_worked
    FROM (
      SELECT sh.shift_date AS d
      FROM shifts sh
      WHERE sh.staff_id = v_staff.id
        AND sh.shift_date BETWEEN v_emp_start AND v_emp_end
        AND sh.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM staff_attendance a
          WHERE a.staff_id = v_staff.id
            AND a.attendance_date = sh.shift_date
            AND a.status <> 'worked'
        )
      UNION
      SELECT a.attendance_date
      FROM staff_attendance a
      WHERE a.staff_id = v_staff.id
        AND a.attendance_date BETWEEN v_emp_start AND v_emp_end
        AND a.status = 'worked'
    ) AS worked_days;

    -- ---- lateness: always recorded, deducted only behind three gates -------
    -- A punch later than late_max_credible_minutes after shift start is a
    -- MISSED PUNCH, not a late arrival, and is excluded. July 2026 proves why:
    -- the raw view recorded "arrivals" at 15:49, 18:30 and 20:10 against a
    -- 09:30 shift — people discovering the button mid-shift. Counting those as
    -- 380/541/641 minutes late would have put defamatory nonsense on a payslip
    -- (Hein 1,249 min, Mint 1,591 min). After the filter only one credible late
    -- survives in the whole month: Hein, 20 Jul, 67 minutes.
    SELECT COALESCE(COUNT(*), 0)::INTEGER,
           COALESCE(SUM(p.late_minutes), 0)::INTEGER
    INTO v_late_days, v_late_minutes
    FROM v_shift_punctuality p
    WHERE p.staff_id = v_staff.id
      AND p.shift_date BETWEEN v_emp_start AND v_emp_end
      AND p.late_minutes > 0
      AND p.late_minutes <= c_late_max_credible
      AND NOT p.is_excused;

    -- Gate (a) signed acknowledgement, (c) owner-approved amount.
    -- Gate (b) exclusion of excused lates is already in the query above and in
    -- whatever the owner approved.
    IF v_staff.punctuality_ack_on IS NOT NULL THEN
      SELECT COALESCE(SUM(u.amount), 0)
      INTO v_late_deduction
      FROM unworked_time_adjustments u
      WHERE u.staff_id = v_staff.id
        AND u.period_month >= date_trunc('month', v_period.period_start)::date
        AND u.period_month <= v_period.period_end
        AND u.approved_at IS NOT NULL;
    ELSE
      v_late_deduction := 0;
    END IF;

    -- ---- money ------------------------------------------------------------
    IF v_is_partial THEN
      v_base_salary := ROUND(v_daily_rate * LEAST(v_eligible_days, 30), 2);
    ELSE
      v_base_salary := v_staff.monthly_salary;
    END IF;

    v_absence_deduction := ROUND(v_days_absent * v_daily_rate, 2);

    -- Bonus is owner-entered and never touched here; read it back so net_pay
    -- stays consistent when the line already carries one.
    SELECT COALESCE(bonus_pay, 0) INTO v_bonus
    FROM payroll_lines
    WHERE payroll_period_id = p_period_id AND staff_id = v_staff.id;
    v_bonus := COALESCE(v_bonus, 0);

    v_overtime_pay := ROUND(
                        (v_ot_regular_hrs    * v_hourly_rate * c_ot_regular)
                      + (v_ot_holiday_hrs    * v_hourly_rate * c_ot_holiday)
                      + (v_ot_holiday_ot_hrs * v_hourly_rate * c_ot_holiday_ot), 2);

    -- other_deductions now carries ONLY the late deduction. It used to be an
    -- anonymous lump read from the same table; lateness gets its own visible
    -- columns and this stays as the single monetary channel for it.
    v_other_deductions := v_late_deduction;

    -- ---- social security --------------------------------------------------
    -- Switch is the enrolment DATE, not the presence of a number: filling a
    -- number in today must not restate a closed month.
    IF v_staff.sso_enrolled_from IS NOT NULL
       AND v_staff.sso_enrolled_from <= v_period.period_end THEN
      v_salary_for_sso := LEAST(v_base_salary, c_sso_ceiling);
      v_sso_employee   := ROUND(v_salary_for_sso * c_sso_employee_rate, 2);
      v_sso_employer   := ROUND(v_salary_for_sso * c_sso_employer_rate, 2);
    ELSE
      v_sso_employee := 0;
      v_sso_employer := 0;
    END IF;

    -- ---- withholding tax --------------------------------------------------
    -- Regular monthly slice of the annual liability, plus the marginal tax on
    -- any bonus paid this month (irregular income is withheld when paid).
    v_wht := ROUND(fn_thai_pit_annual(v_staff.monthly_salary * 12) / 12.0, 2)
           + GREATEST(
               fn_thai_pit_annual(v_staff.monthly_salary * 12 + v_bonus)
             - fn_thai_pit_annual(v_staff.monthly_salary * 12), 0);

    v_net_pay := v_base_salary + v_overtime_pay + v_bonus
               - v_absence_deduction - v_other_deductions - v_sso_employee - v_wht;

    INSERT INTO payroll_lines (
      payroll_period_id, staff_id,
      days_worked, days_absent, days_leave_paid,
      late_days, late_minutes, late_deduction,
      base_salary, overtime_pay, bonus_pay, absence_deduction,
      sso_employee, sso_employer,
      withholding_tax, other_deductions, net_pay
    ) VALUES (
      p_period_id, v_staff.id,
      v_days_worked, v_days_absent, v_days_leave_paid,
      v_late_days, v_late_minutes, v_late_deduction,
      v_base_salary, v_overtime_pay, v_bonus, v_absence_deduction,
      v_sso_employee, v_sso_employer,
      v_wht, v_other_deductions, v_net_pay
    )
    ON CONFLICT (payroll_period_id, staff_id) DO UPDATE SET
      days_worked       = EXCLUDED.days_worked,
      days_absent       = EXCLUDED.days_absent,
      days_leave_paid   = EXCLUDED.days_leave_paid,
      late_days         = EXCLUDED.late_days,
      late_minutes      = EXCLUDED.late_minutes,
      late_deduction    = EXCLUDED.late_deduction,
      base_salary       = EXCLUDED.base_salary,
      overtime_pay      = EXCLUDED.overtime_pay,
      absence_deduction = EXCLUDED.absence_deduction,
      sso_employee      = EXCLUDED.sso_employee,
      sso_employer      = EXCLUDED.sso_employer,
      withholding_tax   = EXCLUDED.withholding_tax,
      other_deductions  = EXCLUDED.other_deductions,
      net_pay           = EXCLUDED.net_pay;
      -- bonus_pay, bonus_note, notes and is_manual_override are deliberately
      -- absent: they are owner-entered and must survive a recalculation.
  END LOOP;

  UPDATE payroll_periods
  SET status = 'calculated', updated_at = now()
  WHERE id = p_period_id;

  RETURN QUERY
  SELECT * FROM payroll_lines WHERE payroll_period_id = p_period_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. fn_approve_payroll v2
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_approve_payroll(p_period_id uuid, p_approved_by text DEFAULT 'lesia'::text)
RETURNS SETOF payroll_periods
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_period          RECORD;
  v_line            RECORD;
  v_expense_id      UUID;
  v_advances        NUMERIC;
  v_balance         NUMERIC;
  v_total_sso_er    NUMERIC := 0;
  v_unreviewed      INTEGER;
  v_overpaid        TEXT;
BEGIN
  SELECT * INTO v_period
  FROM payroll_periods
  WHERE id = p_period_id AND status = 'calculated';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period % not found or not in calculated status', p_period_id;
  END IF;

  -- Gate 1: lateness must be reviewed before the money is signed off.
  -- CEO 2026-07-31: "опоздания одобряем при закрытии периода".
  SELECT COUNT(*) INTO v_unreviewed
  FROM payroll_lines
  WHERE payroll_period_id = p_period_id AND late_days > 0;

  IF v_unreviewed > 0 AND v_period.punctuality_reviewed_at IS NULL THEN
    RAISE EXCEPTION
      'Period % has % line(s) with unexcused lates and no punctuality review. '
      'Review lates (excuse or approve the unworked minutes) before approving.',
      p_period_id, v_unreviewed;
  END IF;

  -- Gate 2: nobody may have been advanced more than they are owed. Beyond the
  -- arithmetic, an advance exceeding the entitlement stops being a wage advance
  -- and becomes a debt — see the staff_payments comment.
  SELECT string_agg(s.name, ', ') INTO v_overpaid
  FROM payroll_lines pl
  JOIN staff s ON s.id = pl.staff_id
  WHERE pl.payroll_period_id = p_period_id
    AND COALESCE((SELECT SUM(sp.amount) FROM staff_payments sp
                  WHERE sp.payroll_period_id = p_period_id
                    AND sp.staff_id = pl.staff_id), 0) > pl.net_pay;

  IF v_overpaid IS NOT NULL THEN
    RAISE EXCEPTION 'Advances exceed net pay for: %. Resolve before approving.', v_overpaid;
  END IF;

  FOR v_line IN
    SELECT pl.*, s.name AS staff_name
    FROM payroll_lines pl
    JOIN staff s ON s.id = pl.staff_id
    WHERE pl.payroll_period_id = p_period_id
  LOOP
    -- Money leaves once. Advances already paid during the month carry their own
    -- ledger entries, so only the remaining balance is booked here. This is the
    -- same class of bug as the old separate overtime row, which is gone below.
    SELECT COALESCE(SUM(sp.amount), 0) INTO v_advances
    FROM staff_payments sp
    WHERE sp.payroll_period_id = p_period_id
      AND sp.staff_id = v_line.staff_id
      AND sp.expense_ledger_id IS NOT NULL;

    v_balance := v_line.net_pay - v_advances;

    IF v_balance > 0 THEN
      INSERT INTO expense_ledger (
        transaction_date, flow_type,
        category_code, sub_category_code,
        details, amount_original, currency,
        paid_by, payment_method, status
      ) VALUES (
        v_period.period_end, 'OpEx',
        2600, 2601,
        format('Salary: %s (%s to %s)%s',
               v_line.staff_name, v_period.period_start, v_period.period_end,
               CASE WHEN v_advances > 0
                    THEN format(' — balance after %s advanced', v_advances)
                    ELSE '' END),
        v_balance, 'THB',
        p_approved_by, 'cash', 'paid'
      )
      RETURNING id INTO v_expense_id;

      UPDATE payroll_lines
      SET expense_ledger_id = v_expense_id
      WHERE id = v_line.id;
    END IF;

    v_total_sso_er := v_total_sso_er + v_line.sso_employer;
  END LOOP;

  -- Employer's SSO share is a real additional cost, not part of anyone's net,
  -- so it keeps its own entry.
  IF v_total_sso_er > 0 THEN
    INSERT INTO expense_ledger (
      transaction_date, flow_type,
      category_code, sub_category_code,
      details, amount_original, currency,
      paid_by, payment_method, status
    ) VALUES (
      v_period.period_end, 'OpEx',
      2600, 2603,
      format('Social Security employer contribution (%s to %s)',
             v_period.period_start, v_period.period_end),
      v_total_sso_er, 'THB',
      p_approved_by, 'transfer', 'paid'
    );
  END IF;

  -- The 2604 "Overtime pay" entry that used to be written here is GONE.
  -- net_pay already contains overtime_pay and bonus_pay, so that row double-
  -- booked every one of them (April 2026 overstated by 4,000 THB — MC aabd3401).

  UPDATE payroll_periods
  SET status = 'approved', approved_by = p_approved_by,
      approved_at = now(), updated_at = now()
  WHERE id = p_period_id;

  RETURN QUERY
  SELECT * FROM payroll_periods WHERE id = p_period_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Ledger
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('396_hr_phase1_payroll_spine.sql', 'claude-opus-session-eb56fda0', 'success',
        'HR Phase 1: payroll_lines + bonus_pay/bonus_note/late_days/late_minutes/late_deduction/'
     || 'is_manual_override; staff + sso_enrolled_from/date_of_birth/address/legal names; '
     || 'payroll_periods + punctuality_reviewed_at; new staff_payments table (advances, owner-gated '
     || 'RLS). fn_thai_pit_annual implements the real progressive PIT (returns 0 at current salaries, '
     || 'stays correct after a raise). fn_calculate_payroll v3 derives days_worked from shifts minus '
     || 'attendance exceptions bounded by employment dates, records lateness always but deducts only '
     || 'behind three LEG-004 gates, switches SSO on sso_enrolled_from, and preserves owner-entered '
     || 'bonus/notes/override across recalculation. fn_approve_payroll v2 removes the 2604 overtime '
     || 'double-book, pays cash, books net minus advances, and refuses on unreviewed lates or '
     || 'advances exceeding net. MC 679e41d4.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- Restore fn_calculate_payroll and fn_approve_payroll from mig 218 + the live
-- definitions captured in docs/plans/spec-hr-payroll-process.md.
-- ALTER TABLE public.payroll_lines
--   DROP COLUMN IF EXISTS bonus_pay, DROP COLUMN IF EXISTS bonus_note,
--   DROP COLUMN IF EXISTS late_days, DROP COLUMN IF EXISTS late_minutes,
--   DROP COLUMN IF EXISTS late_deduction, DROP COLUMN IF EXISTS is_manual_override;
-- ALTER TABLE public.staff DROP COLUMN IF EXISTS sso_enrolled_from, ...;
-- ALTER TABLE public.payroll_periods DROP COLUMN IF EXISTS punctuality_reviewed_at, ...;
-- DROP TABLE IF EXISTS public.staff_payments;   -- INTENTIONAL DROP
-- DROP FUNCTION IF EXISTS public.fn_thai_pit_annual(numeric);
-- DELETE FROM public.migration_log WHERE filename='396_hr_phase1_payroll_spine.sql';
-- COMMIT;
