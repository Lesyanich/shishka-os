-- ============================================================
-- Migration 219: staff.work_permit_annual_thb
-- MC task: eea6c129 (payslip employer-paid benefits display)
--
-- Stores the EMPLOYER-PAID annual cost of work permit + visa +
-- SSO registration + document processing per migrant employee
-- (paid 2026-05 to Blessed Business / Mr. Ram, expense 4447d068,
--  15,000 THB each for the 3 Myanmar staff).
--
-- This is INFORMATIONAL ONLY. It is shown on the payslip as an
-- "Employer-paid (not deducted)" benefit so the employee sees the
-- company's real cost-to-company. It is NEVER deducted from wages —
-- deducting work-permit costs from a migrant worker's pay is
-- prohibited under the Royal Decree on the Management of Foreign
-- Workers' Employment B.E. 2560 (and LPA §76 on wage deductions).
-- ============================================================

BEGIN;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_permit_annual_thb NUMERIC;

COMMENT ON COLUMN staff.work_permit_annual_thb IS
  'Employer-paid annual work permit + visa + SSO registration cost (THB). Informational only — NEVER deducted from wages (prohibited under Royal Decree on Management of Foreign Workers Employment B.E. 2560). Displayed on payslip as employer-paid benefit.';

-- Populate the 3 Myanmar work-permit holders (Blessed Business IV-20260500021).
UPDATE staff SET work_permit_annual_thb = 15000
WHERE id IN (
  '9c979e6b-2e14-4f05-9ba1-1c7a9f0310bb',  -- Alex (Aung Khant Phyo)
  'efcd98a5-78cb-4d3f-a274-7e79f22bc556',  -- Hein (Kyaw Swar Hein)
  'b1fb72db-55b6-4afd-be85-be598a7c19ac'   -- Nono (Noe Noe Zin)
);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '219_staff_employer_paid_work_permit.sql',
  'claude-code',
  NULL,
  'Add staff.work_permit_annual_thb (employer-paid, informational); seed 15000 for 3 Myanmar staff. MC eea6c129.'
)
ON CONFLICT DO NOTHING;

COMMIT;
