-- 356_delete_stray_sunday_shifts.sql
-- Remove 3 stray shifts that fall on Sunday — the shop's closed day
-- (payroll_config.closed_weekday = 0). They are historical junk from an early
-- auto-plan run: Alex on 2026-03-22, 2026-03-29, 2026-04-05. No other Sunday
-- shifts exist, and these rows have zero child records (shift_tasks = 0,
-- shift_clock_events = 0), so the delete is self-contained.
--
-- Scoped to the three known dates rather than a blanket EXTRACT(DOW)=0 so a
-- future intentionally-scheduled Sunday can't be swept up by a re-run.

DELETE FROM shifts
WHERE EXTRACT(DOW FROM shift_date) = 0
  AND shift_date IN ('2026-03-22', '2026-03-29', '2026-04-05');

-- Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '356_delete_stray_sunday_shifts.sql',
  'claude-code',
  NULL,
  'Delete 3 stray Sunday shifts (Alex 2026-03-22/03-29/04-05) — closed-day junk from early auto-plan, 0 child rows (task 7e355fe5 P2)'
)
ON CONFLICT DO NOTHING;
