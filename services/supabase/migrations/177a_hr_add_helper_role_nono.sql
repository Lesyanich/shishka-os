-- ============================================================
-- Migration 176: Add 'helper' to staff.role + insert Nono + Alex absence
-- MC task: 009f310a
-- ============================================================

BEGIN;

-- 1. Add 'helper' to staff.role CHECK constraint
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('cook', 'sous_chef', 'admin', 'dishwasher', 'prep', 'helper'));

-- 2. Insert Nono (helper, Myanmar, 12k THB, probation, hired 2026-05-15)
-- app_role = 'cook' (KDS access, not admin)
INSERT INTO staff (name, role, app_role, monthly_salary, hire_date, employment_type, nationality, is_active)
VALUES ('Nono', 'helper', 'cook', 12000, '2026-05-15', 'probation', 'myanmar', true);

-- 3. Record Alex absent on 2026-05-14
INSERT INTO staff_attendance (staff_id, attendance_date, status)
SELECT id, '2026-05-14', 'absent'
FROM staff WHERE name = 'Alex' AND is_active = true
ON CONFLICT (staff_id, attendance_date) DO UPDATE SET status = 'absent';

-- 4. Self-register in migration_log
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '177a_hr_add_helper_role_nono.sql',
  'claude-code',
  NULL,
  'Add helper to staff.role CHECK, INSERT Nono (helper, 12k, probation, myanmar), Alex absent 2026-05-14 (MC 009f310a)'
)
ON CONFLICT DO NOTHING;

COMMIT;
