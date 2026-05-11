-- ============================================================
-- Migration 168: HR & Payroll DB Foundation
-- Phase 1 of HR & Payroll module
-- MC task: 429794cb, parent initiative: 24e6ae48
-- ============================================================

BEGIN;

-- ============================================================
-- Section 1: ALTER staff (+10 HR columns)
-- ============================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS fire_date DATE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'probation'));
ALTER TABLE staff ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_permit_number TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_permit_expiry DATE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS sso_number TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS probation_end_date DATE;

-- ============================================================
-- Section 2: UPDATE existing staff with HR data
-- ============================================================

-- Alex: cook, Myanmar, 15k, hired ~2026-01 (approximate)
UPDATE staff SET monthly_salary = 15000, hire_date = '2026-01-15',
  employment_type = 'full_time', nationality = 'myanmar'
WHERE name = 'Alex' AND is_active = true;

-- Hein: cook, Myanmar, 15k, hired ~2026-02
UPDATE staff SET monthly_salary = 15000, hire_date = '2026-02-01',
  employment_type = 'full_time', nationality = 'myanmar'
WHERE name = 'Hein' AND is_active = true;

-- Pa: fired 2026-04-06
UPDATE staff SET fire_date = '2026-04-06', nationality = 'thai'
WHERE name = 'Pa';

-- Lesia, Bas: owners — no salary, nationality thai
UPDATE staff SET employment_type = 'full_time', nationality = 'thai'
WHERE name IN ('Lesia', 'Bas');

-- ============================================================
-- Section 3: CREATE staff_attendance
-- ============================================================

CREATE TABLE staff_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  attendance_date DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'worked'
                  CHECK (status IN ('worked', 'absent', 'sick_leave', 'annual_leave', 'personal_leave', 'maternity_leave', 'paternity_leave', 'holiday', 'day_off')),
  overtime_hours  NUMERIC DEFAULT 0 CHECK (overtime_hours >= 0),
  overtime_type   TEXT CHECK (overtime_type IN ('regular', 'holiday', 'holiday_ot')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, attendance_date)
);

CREATE INDEX idx_attendance_staff_date ON staff_attendance(staff_id, attendance_date);
CREATE INDEX idx_attendance_date ON staff_attendance(attendance_date);

-- ============================================================
-- Section 4: CREATE payroll_periods
-- ============================================================

CREATE TABLE payroll_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'calculated', 'approved', 'paid')),
  approved_by   TEXT,
  approved_at   TIMESTAMPTZ,
  paid_at       TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_start, period_end)
);

-- ============================================================
-- Section 5: CREATE payroll_lines
-- ============================================================

CREATE TABLE payroll_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id   UUID NOT NULL REFERENCES payroll_periods(id),
  staff_id            UUID NOT NULL REFERENCES staff(id),
  days_worked         INTEGER NOT NULL DEFAULT 0,
  days_absent         INTEGER NOT NULL DEFAULT 0,
  days_leave_paid     INTEGER NOT NULL DEFAULT 0,
  base_salary         NUMERIC NOT NULL DEFAULT 0,
  overtime_pay        NUMERIC NOT NULL DEFAULT 0,
  absence_deduction   NUMERIC NOT NULL DEFAULT 0,
  sso_employee        NUMERIC NOT NULL DEFAULT 0,
  sso_employer        NUMERIC NOT NULL DEFAULT 0,
  withholding_tax     NUMERIC NOT NULL DEFAULT 0,
  other_deductions    NUMERIC NOT NULL DEFAULT 0,
  net_pay             NUMERIC NOT NULL DEFAULT 0,
  expense_ledger_id   UUID REFERENCES expense_ledger(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, staff_id)
);

-- ============================================================
-- Section 6: CREATE leave_balances
-- ============================================================

CREATE TABLE leave_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES staff(id),
  year          INTEGER NOT NULL,
  leave_type    TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'personal', 'maternity', 'paternity')),
  entitlement   NUMERIC NOT NULL DEFAULT 0,
  used          NUMERIC NOT NULL DEFAULT 0,
  remaining     NUMERIC GENERATED ALWAYS AS (entitlement - used) STORED,
  UNIQUE(staff_id, year, leave_type)
);

-- ============================================================
-- Section 7: CREATE public_holidays
-- ============================================================

CREATE TABLE public_holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  DATE NOT NULL UNIQUE,
  name_en       TEXT NOT NULL,
  name_th       TEXT,
  year          INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)::INTEGER) STORED
);

-- Seed Thai public holidays 2026 (observed dates)
INSERT INTO public_holidays (holiday_date, name_en, name_th) VALUES
  ('2026-01-01', 'New Year''s Day', E'\u0E27\u0E31\u0E19\u0E02\u0E36\u0E49\u0E19\u0E1B\u0E35\u0E43\u0E2B\u0E21\u0E48'),
  ('2026-02-17', 'Makha Bucha Day (substitute)', E'\u0E27\u0E31\u0E19\u0E21\u0E32\u0E06\u0E1A\u0E39\u0E0A\u0E32'),
  ('2026-04-06', 'Chakri Memorial Day', E'\u0E27\u0E31\u0E19\u0E08\u0E31\u0E01\u0E23\u0E35'),
  ('2026-04-13', 'Songkran Festival', E'\u0E27\u0E31\u0E19\u0E2A\u0E07\u0E01\u0E23\u0E32\u0E19\u0E15\u0E4C'),
  ('2026-04-14', 'Songkran Festival', E'\u0E27\u0E31\u0E19\u0E2A\u0E07\u0E01\u0E23\u0E32\u0E19\u0E15\u0E4C'),
  ('2026-04-15', 'Songkran Festival', E'\u0E27\u0E31\u0E19\u0E2A\u0E07\u0E01\u0E23\u0E32\u0E19\u0E15\u0E4C'),
  ('2026-05-01', 'National Labour Day', E'\u0E27\u0E31\u0E19\u0E41\u0E23\u0E07\u0E07\u0E32\u0E19\u0E41\u0E2B\u0E48\u0E07\u0E0A\u0E32\u0E15\u0E34'),
  ('2026-05-05', 'Coronation Day', E'\u0E27\u0E31\u0E19\u0E09\u0E31\u0E15\u0E23\u0E21\u0E07\u0E04\u0E25'),
  ('2026-05-12', 'Visakha Bucha Day (substitute)', E'\u0E27\u0E31\u0E19\u0E27\u0E34\u0E2A\u0E32\u0E02\u0E1A\u0E39\u0E0A\u0E32'),
  ('2026-06-03', 'Queen Suthida''s Birthday', E'\u0E27\u0E31\u0E19\u0E40\u0E09\u0E25\u0E34\u0E21\u0E1E\u0E23\u0E30\u0E0A\u0E19\u0E21\u0E1E\u0E23\u0E23\u0E29\u0E32'),
  ('2026-07-28', 'King''s Birthday', E'\u0E27\u0E31\u0E19\u0E40\u0E09\u0E25\u0E34\u0E21\u0E1E\u0E23\u0E30\u0E0A\u0E19\u0E21\u0E1E\u0E23\u0E23\u0E29\u0E32'),
  ('2026-08-12', 'Queen Sirikit''s Birthday', E'\u0E27\u0E31\u0E19\u0E41\u0E21\u0E48\u0E41\u0E2B\u0E48\u0E07\u0E0A\u0E32\u0E15\u0E34'),
  ('2026-10-13', 'King Bhumibol Memorial Day', E'\u0E27\u0E31\u0E19\u0E04\u0E25\u0E49\u0E32\u0E22\u0E27\u0E31\u0E19\u0E2A\u0E27\u0E23\u0E23\u0E04\u0E15'),
  ('2026-10-23', 'Chulalongkorn Day', E'\u0E27\u0E31\u0E19\u0E1B\u0E34\u0E22\u0E21\u0E2B\u0E32\u0E23\u0E32\u0E0A'),
  ('2026-12-05', 'King Bhumibol''s Birthday', E'\u0E27\u0E31\u0E19\u0E1E\u0E48\u0E2D\u0E41\u0E2B\u0E48\u0E07\u0E0A\u0E32\u0E15\u0E34'),
  ('2026-12-10', 'Constitution Day', E'\u0E27\u0E31\u0E19\u0E23\u0E31\u0E10\u0E18\u0E23\u0E23\u0E21\u0E19\u0E39\u0E0D'),
  ('2026-12-31', 'New Year''s Eve', E'\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E1B\u0E35');

-- ============================================================
-- Section 8: CREATE payroll_config
-- ============================================================

CREATE TABLE payroll_config (
  key           TEXT PRIMARY KEY,
  value         NUMERIC NOT NULL,
  description   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO payroll_config (key, value, description) VALUES
  ('sso_employee_rate', 0.05, 'Social Security employee contribution rate'),
  ('sso_employer_rate', 0.05, 'Social Security employer contribution rate'),
  ('sso_ceiling_thb', 17500, 'Monthly salary ceiling for SSO calculation (2026)'),
  ('min_wage_daily_thb', 370, 'Thai minimum daily wage 2026 (Bangkok rate)'),
  ('ot_multiplier_regular', 1.5, 'Overtime multiplier for regular working days'),
  ('ot_multiplier_holiday', 2.0, 'Overtime multiplier for holidays (base)'),
  ('ot_multiplier_holiday_ot', 3.0, 'Overtime multiplier for holiday OT hours');

-- ============================================================
-- Section 9: Seed fin_category for labor
-- ============================================================

INSERT INTO fin_categories (code, name, type) VALUES
  (2600, 'Labor & Payroll', 'Expense')
ON CONFLICT (code) DO NOTHING;

INSERT INTO fin_sub_categories (sub_code, category_code, name) VALUES
  (2601, 2600, 'Salary — Kitchen Staff'),
  (2602, 2600, 'Salary — Admin'),
  (2603, 2600, 'Social Security (Employer)'),
  (2604, 2600, 'Overtime Pay')
ON CONFLICT (sub_code) DO NOTHING;

-- ============================================================
-- Section 10: RLS policies
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_config ENABLE ROW LEVEL SECURITY;

-- SELECT for authenticated on all 6 tables
CREATE POLICY "staff_attendance_select_auth" ON staff_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_periods_select_auth" ON payroll_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_lines_select_auth" ON payroll_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "leave_balances_select_auth" ON leave_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "public_holidays_select_auth" ON public_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_config_select_auth" ON payroll_config FOR SELECT TO authenticated USING (true);

-- ALL for authenticated on writable HR tables
CREATE POLICY "staff_attendance_all_auth" ON staff_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payroll_periods_all_auth" ON payroll_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payroll_lines_all_auth" ON payroll_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leave_balances_all_auth" ON leave_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SELECT for anon on reference tables only
CREATE POLICY "public_holidays_select_anon" ON public_holidays FOR SELECT TO anon USING (true);
CREATE POLICY "payroll_config_select_anon" ON payroll_config FOR SELECT TO anon USING (true);

-- ============================================================
-- Section 11: Self-register in migration_log
-- ============================================================

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '168_hr_payroll_foundation.sql',
  'claude-code',
  NULL,
  'HR & Payroll DB foundation: ALTER staff +10 cols, CREATE staff_attendance/payroll_periods/payroll_lines/leave_balances/public_holidays/payroll_config, seed fin_category 2600, seed Thai holidays 2026 (MC 429794cb, parent 24e6ae48)'
)
ON CONFLICT DO NOTHING;

COMMIT;
