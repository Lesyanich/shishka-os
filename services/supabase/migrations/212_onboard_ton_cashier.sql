-- ============================================================
-- Migration 212: Add 'cashier' role + onboard Ton
-- MC task: cce7adf2
-- ============================================================

BEGIN;

-- 1. Extend staff.role CHECK to include 'cashier'
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('cook', 'sous_chef', 'admin', 'dishwasher', 'prep', 'helper', 'cashier'));

-- 2. Insert Ton (cashier, Thai, 19k THB, probation 119 days, start 2026-05-21)
INSERT INTO staff (name, role, app_role, monthly_salary, hire_date, employment_type, nationality, probation_end_date, is_active)
VALUES ('Ton', 'cashier', 'cook', 19000, '2026-05-21', 'probation', 'thai', '2026-09-16', true);

-- 3. Seed leave_balances for Ton (2026) — prorated: joined May, ~7 months left
--    Annual: 6 days (LPA §30, but only after 1yr — set entitlement 0 for year 1)
--    Sick: 30 days (LPA §32, available from day 1)
INSERT INTO leave_balances (staff_id, year, leave_type, entitlement)
SELECT id, 2026, 'annual', 0 FROM staff WHERE name = 'Ton' AND is_active = true
UNION ALL
SELECT id, 2026, 'sick', 30 FROM staff WHERE name = 'Ton' AND is_active = true
UNION ALL
SELECT id, 2026, 'personal', 3 FROM staff WHERE name = 'Ton' AND is_active = true;

-- 4. Self-register in migration_log
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '212_onboard_ton_cashier.sql',
  'claude-code',
  NULL,
  'Add cashier to staff.role CHECK, INSERT Ton (cashier, 19k, probation, thai, start 2026-05-21), seed leave_balances (MC cce7adf2)'
)
ON CONFLICT DO NOTHING;

COMMIT;
