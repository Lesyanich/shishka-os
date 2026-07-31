-- 398_payroll_legal_corrections.sql
-- MC task: b4876c65-6974-4a64-a9c0-b6bbae7efa22 (authored by /lawyer, CEO decisions A-F)
-- Spec: the CEO-decisions comment on that task, 2026-07-31 11:15
--
-- Implements the legal review of the July 2026 payslips. Points A, C, D and F
-- of the CEO's decision list land here; B and E are renderer-side.
--
-- A. SOCIAL SECURITY MUST NOT BE GATED ON A REFERENCE NUMBER.
--    Migration 396 keyed the 5% deduction off `sso_enrolled_from`, which was
--    NULL for everyone, so every July slip printed "Social Security (5%) — ฿0 —
--    not enrolled · nothing withheld". All four staff ARE enrolled; only the
--    reference numbers have not been typed in. Enrolment is a legal fact; the
--    number is reference data, and the deduction must follow the fact.
--
--    Adds `staff.sso_enrolled` as the master switch, exactly as the CEO
--    specified. `sso_enrolled_from` is kept as an optional "not before this
--    date" refinement rather than being dropped: without it, ticking the box
--    today would retroactively restate every closed period, and June is already
--    calculated. Both must pass. `sso_number` no longer gates anything.
--
--    SAFEGUARD, raised once and not an objection to the decision: the CEO asked
--    for `default true`, which treats a future hire as enrolled from day one —
--    but the สปส.1-03 enrolment is only due within 30 days of hire. Deducting 5%
--    before enrolment actually happens withholds money with no contribution
--    behind it, which is the one thing LPA §76(1) does not authorise. The
--    default stays true as instructed; the new-hire flow should set it false
--    until the filing is made. Flagged on the task.
--
-- C. Advances already handed over must appear on the slip as settlements below
--    the net line. The three the CEO reported are recorded here. All three sit
--    within wages accrued by their date, which is what keeps them wage advances
--    rather than loans — recovering a loan from wages fits no category in
--    LPA §76 and would need separate written consent.
--
-- D. Noe Noe has passed probation. Note the label does not drive the money:
--    LPA §118 severance turns on length of service, not on what the contract
--    calls someone.
--
-- F. Noe Noe's bonus is relabelled: ฿400 is compensation for working a public
--    holiday (LPA §62), ฿800 is a discretionary waiver of the remaining absence.
--
-- ALSO: Lesia is added to payroll. Her ฿35,000 salary is what her work permit
-- rests on, and with `monthly_salary` NULL `fn_calculate_payroll` produced no
-- line for her at all. See the flag at §5 — the start date is deliberately
-- conservative and the back-pay question is NOT decided here.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The enrolment flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS sso_enrolled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.staff.sso_enrolled IS
  'Master switch for the 5% social-security deduction (LPA §76(1)). Enrolment is a legal fact; '
  '`sso_number` is reference data and must NEVER gate the deduction. New hires should be set false '
  'until the สปส.1-03 is actually filed — deducting before enrolment withholds money with no '
  'contribution behind it.';

COMMENT ON COLUMN public.staff.sso_enrolled_from IS
  'Optional "not before" date. Guards closed periods: ticking sso_enrolled today must not '
  'retroactively restate a month that was already calculated. NULL means "since always".';

-- All four are enrolled (CEO, 2026-07-31). July is the first period to carry
-- contributions — the สปส.1-10 due 15 Aug covers July, and the accountant's
-- baseline starts there. Whether June also owes contributions is an open
-- question for the accountant, flagged on MC b4876c65; it is NOT assumed here.
UPDATE public.staff
SET sso_enrolled      = true,
    sso_enrolled_from = DATE '2026-07-01'
WHERE monthly_salary IS NOT NULL
  AND is_active;

-- ---------------------------------------------------------------------------
-- 2. Confirm the SSF ceiling
-- ---------------------------------------------------------------------------
-- Migration 395 flagged 17,500 as unverified. /lawyer confirms it: the ceiling
-- is 17,500 from 1 Jan 2026, max contribution 875 — not the old 15,000/750.

UPDATE public.payroll_config
SET description = 'Monthly salary ceiling for SSO calculation. 17,500 from 1 Jan 2026 '
               || '(max contribution 875), replacing the long-standing 15,000/750. Confirmed by '
               || '/lawyer 2026-07-31 against the accountant''s figures — MC b4876c65.',
    updated_at  = now()
WHERE key = 'sso_ceiling_thb';

-- ---------------------------------------------------------------------------
-- 3. The deduction now follows the fact of enrolment
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
  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id AND status = 'draft';
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
           sso_enrolled, sso_enrolled_from, punctuality_ack_on
    FROM staff
    WHERE monthly_salary IS NOT NULL AND hire_date IS NOT NULL
      AND hire_date <= v_period.period_end
      AND (fire_date IS NULL OR fire_date >= v_period.period_start)
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_lines
      WHERE payroll_period_id = p_period_id AND staff_id = v_staff.id AND is_manual_override
    );

    v_daily_rate  := v_staff.monthly_salary / 30.0;
    v_hourly_rate := v_daily_rate / 8.0;

    v_emp_start := GREATEST(v_staff.hire_date, v_period.period_start);
    v_emp_end   := LEAST(COALESCE(v_staff.fire_date, v_period.period_end), v_period.period_end);
    v_eligible_days := GREATEST((v_emp_end - v_emp_start) + 1, 0);

    v_is_partial := (v_staff.hire_date > v_period.period_start)
                 OR (v_staff.fire_date IS NOT NULL AND v_staff.fire_date < v_period.period_end);

    SELECT
      COALESCE(COUNT(*) FILTER (WHERE status = 'absent'), 0)::INTEGER,
      COALESCE(COUNT(*) FILTER (WHERE status IN ('sick_leave','annual_leave','personal_leave','maternity_leave','paternity_leave')), 0)::INTEGER,
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'regular'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday'), 0),
      COALESCE(SUM(overtime_hours) FILTER (WHERE overtime_type = 'holiday_ot'), 0)
    INTO v_days_absent, v_days_leave_paid, v_ot_regular_hrs, v_ot_holiday_hrs, v_ot_holiday_ot_hrs
    FROM staff_attendance
    WHERE staff_id = v_staff.id AND attendance_date BETWEEN v_emp_start AND v_emp_end;

    SELECT COUNT(*)::INTEGER INTO v_days_worked
    FROM (
      SELECT sh.shift_date AS d
      FROM shifts sh
      WHERE sh.staff_id = v_staff.id
        AND sh.shift_date BETWEEN v_emp_start AND v_emp_end
        AND sh.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM staff_attendance a
          WHERE a.staff_id = v_staff.id AND a.attendance_date = sh.shift_date AND a.status <> 'worked'
        )
      UNION
      SELECT a.attendance_date
      FROM staff_attendance a
      WHERE a.staff_id = v_staff.id
        AND a.attendance_date BETWEEN v_emp_start AND v_emp_end
        AND a.status = 'worked'
    ) AS worked_days;

    SELECT COALESCE(COUNT(*), 0)::INTEGER, COALESCE(SUM(p.late_minutes), 0)::INTEGER
    INTO v_late_days, v_late_minutes
    FROM v_shift_punctuality p
    WHERE p.staff_id = v_staff.id
      AND p.shift_date BETWEEN v_emp_start AND v_emp_end
      AND p.late_minutes > 0
      AND p.late_minutes <= c_late_max_credible
      AND NOT p.is_excused;

    IF v_staff.punctuality_ack_on IS NOT NULL THEN
      SELECT COALESCE(SUM(u.amount), 0) INTO v_late_deduction
      FROM unworked_time_adjustments u
      WHERE u.staff_id = v_staff.id
        AND u.period_month >= date_trunc('month', v_period.period_start)::date
        AND u.period_month <= v_period.period_end
        AND u.approved_at IS NOT NULL;
    ELSE
      v_late_deduction := 0;
    END IF;

    IF v_is_partial THEN
      v_base_salary := ROUND(v_daily_rate * LEAST(v_eligible_days, 30), 2);
    ELSE
      v_base_salary := v_staff.monthly_salary;
    END IF;

    v_absence_deduction := ROUND(v_days_absent * v_daily_rate, 2);

    SELECT COALESCE(bonus_pay, 0) INTO v_bonus
    FROM payroll_lines WHERE payroll_period_id = p_period_id AND staff_id = v_staff.id;
    v_bonus := COALESCE(v_bonus, 0);

    v_overtime_pay := ROUND(
                        (v_ot_regular_hrs    * v_hourly_rate * c_ot_regular)
                      + (v_ot_holiday_hrs    * v_hourly_rate * c_ot_holiday)
                      + (v_ot_holiday_ot_hrs * v_hourly_rate * c_ot_holiday_ot), 2);

    v_other_deductions := v_late_deduction;

    -- CEO decision A: the fact of enrolment decides, not the reference number.
    -- sso_enrolled_from still guards already-closed periods.
    IF v_staff.sso_enrolled
       AND (v_staff.sso_enrolled_from IS NULL OR v_staff.sso_enrolled_from <= v_period.period_end)
    THEN
      v_salary_for_sso := LEAST(v_base_salary, c_sso_ceiling);
      v_sso_employee   := ROUND(v_salary_for_sso * c_sso_employee_rate, 2);
      v_sso_employer   := ROUND(v_salary_for_sso * c_sso_employer_rate, 2);
    ELSE
      v_sso_employee := 0;
      v_sso_employer := 0;
    END IF;

    v_wht := ROUND(fn_thai_pit_annual(v_staff.monthly_salary * 12) / 12.0, 2)
           + GREATEST(fn_thai_pit_annual(v_staff.monthly_salary * 12 + v_bonus)
                    - fn_thai_pit_annual(v_staff.monthly_salary * 12), 0);

    v_net_pay := v_base_salary + v_overtime_pay + v_bonus
               - v_absence_deduction - v_other_deductions - v_sso_employee - v_wht;

    INSERT INTO payroll_lines (
      payroll_period_id, staff_id, days_worked, days_absent, days_leave_paid,
      late_days, late_minutes, late_deduction,
      base_salary, overtime_pay, bonus_pay, absence_deduction,
      sso_employee, sso_employer, withholding_tax, other_deductions, net_pay
    ) VALUES (
      p_period_id, v_staff.id, v_days_worked, v_days_absent, v_days_leave_paid,
      v_late_days, v_late_minutes, v_late_deduction,
      v_base_salary, v_overtime_pay, v_bonus, v_absence_deduction,
      v_sso_employee, v_sso_employer, v_wht, v_other_deductions, v_net_pay
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
  END LOOP;

  UPDATE payroll_periods SET status = 'calculated', updated_at = now() WHERE id = p_period_id;

  RETURN QUERY SELECT * FROM payroll_lines WHERE payroll_period_id = p_period_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. CEO decisions D and F
-- ---------------------------------------------------------------------------

UPDATE public.staff
SET employment_type = 'full_time'
WHERE name = 'Noe Noe' AND employment_type = 'probation';

UPDATE public.payroll_lines
SET bonus_note = 'THB 400 — compensation for working a public holiday (LPA §62). '
              || 'THB 800 — discretionary waiver of the remaining unpaid absence (08, 09 Jul). '
              || 'CEO decision 2026-07-31: show the days, do not cut the pay.'
WHERE payroll_period_id = '4ad08d26-94f6-4692-b815-fd3312aabcb4'
  AND staff_id = 'b1fb72db-55b6-4afd-be85-be598a7c19ac';

-- ---------------------------------------------------------------------------
-- 5. Lesia onto payroll
-- ---------------------------------------------------------------------------
-- Her ฿35,000 is what the work permit rests on, and with monthly_salary NULL
-- fn_calculate_payroll produced no line for her at all.
--
-- START DATE IS DELIBERATELY CONSERVATIVE. The work permit dates from 25 April
-- 2026, so she was arguably owed a salary from then — but back-paying April to
-- June would restate three periods, two of them already calculated, and that is
-- a decision for the CEO and the accountant, not for a migration. Payroll
-- therefore starts 1 July and the back-pay question is flagged on MC b4876c65.
--
-- Her withholding is left to fn_thai_pit_annual rather than hard-coded. Note
-- /lawyer's open point: Revenue Code §50(1) withholds on income expected in the
-- CURRENT tax year, and with only eight salaried months in 2026 her 2026 PIT is
-- arguably zero, with ~415/month becoming right from January 2027. The function
-- annualises a full twelve months and so over-withholds this year. Over-
-- withholding is not an offence — it is refunded on PND 91 — but the accountant
-- should confirm which figure to file.

UPDATE public.staff
SET monthly_salary = 35000,
    hire_date      = COALESCE(hire_date, DATE '2026-07-01')
WHERE name = 'Lesia' AND monthly_salary IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Advances already handed over (CEO decision C)
-- ---------------------------------------------------------------------------
-- Each sits inside wages accrued by its date, which is what keeps it a wage
-- advance rather than a loan. Verified by /lawyer: Noe Noe 2,000 vs 6,800
-- accrued, Mint 7,000 vs 14,167, Hein 1,000 vs 15,000.

INSERT INTO public.staff_payments
  (staff_id, payroll_period_id, paid_on, amount, kind, payment_method, note, created_by)
VALUES
  ('b1fb72db-55b6-4afd-be85-be598a7c19ac', '4ad08d26-94f6-4692-b815-fd3312aabcb4',
   DATE '2026-07-17', 2000, 'advance', 'cash',
   'Advance reported by CEO, dates supplied 2026-07-31. Within wages accrued by that date (6,800).', 'lawyer-review'),
  ('af85ba68-763c-448f-8342-3a8a308dbfdb', '4ad08d26-94f6-4692-b815-fd3312aabcb4',
   DATE '2026-07-17', 7000, 'advance', 'cash',
   'Advance reported by CEO, dates supplied 2026-07-31. Within wages accrued by that date (14,167).', 'lawyer-review'),
  ('efcd98a5-78cb-4d3f-a274-7e79f22bc556', '4ad08d26-94f6-4692-b815-fd3312aabcb4',
   DATE '2026-07-30', 1000, 'advance', 'cash',
   'Advance reported by CEO, dates supplied 2026-07-31. Within wages accrued by that date (15,000).', 'lawyer-review')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Ledger
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('398_payroll_legal_corrections.sql', 'claude-opus-session-eb56fda0', 'success',
        'Legal review of the July 2026 payslips (MC b4876c65, /lawyer + CEO decisions A-F). '
     || 'staff.sso_enrolled added as the master switch for the 5% deduction — enrolment is a legal '
     || 'fact, sso_number is reference data and no longer gates anything; sso_enrolled_from kept as '
     || 'a "not before" guard so ticking the box cannot restate closed periods. All four staff set '
     || 'enrolled from 2026-07-01. SSF ceiling 17,500 confirmed by /lawyer (was flagged unverified '
     || 'in 395). Noe Noe probation -> full_time and her bonus relabelled 400 holiday-work (LPA s.62) '
     || '+ 800 discretionary waiver. Lesia added to payroll at 35,000 from 2026-07-01 (her WP rests '
     || 'on it; April-June back-pay NOT decided here). Three CEO-reported cash advances recorded in '
     || 'staff_payments, each within wages accrued by its date. MC b4876c65.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DELETE FROM public.staff_payments WHERE created_by = 'lawyer-review';
-- UPDATE public.staff SET monthly_salary = NULL WHERE name = 'Lesia';
-- UPDATE public.staff SET employment_type = 'probation' WHERE name = 'Noe Noe';
-- UPDATE public.staff SET sso_enrolled_from = NULL;
-- ALTER TABLE public.staff DROP COLUMN IF EXISTS sso_enrolled;
-- Restore fn_calculate_payroll from migration 396.
-- DELETE FROM public.migration_log WHERE filename='398_payroll_legal_corrections.sql';
-- COMMIT;
