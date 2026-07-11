-- 354_monday_shifts_templates_0900_1800.sql
-- Finish the 09:00–18:00 hours normalization that migration 347 started.
--
-- 347 normalized all rows in `shifts` but left `staff_schedule_templates`
-- at 08:00–17:00. The Mon→Sun rest-day data-op on 2026-07-05 then generated
-- 36 Monday shifts from those stale templates: 16 future (2026-07-06 ..
-- 2026-07-27) + 20 June backfill (2026-06-01 .. 2026-06-29) — the only
-- 08:00–17:00 rows in the table.
--
-- Reversal (if ever needed): both UPDATEs are exact-window swaps back
-- (09:00–18:00 → 08:00–17:00 on the same predicates); no backup table
-- needed for 40 rows with fully-determined prior state.

-- 1) All 36 stale-template Monday shifts → standard hours (347 already
--    established that historical rows are normalized too).
UPDATE shifts
SET start_time = '09:00:00',
    end_time   = '18:00:00',
    updated_at = now()
WHERE start_time = '08:00:00'
  AND end_time   = '17:00:00';

-- 2) The stale templates themselves (4 rows), so future auto-plan runs
--    generate standard hours.
UPDATE staff_schedule_templates
SET start_time = '09:00:00',
    end_time   = '18:00:00',
    updated_at = now()
WHERE start_time = '08:00:00'
  AND end_time   = '17:00:00';

-- Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '354_monday_shifts_templates_0900_1800.sql',
  'claude-code',
  NULL,
  'Normalize 36 stale-template Monday shifts (16 future + 20 June backfill) + 4 staff_schedule_templates rows from 08:00-17:00 to 09:00-18:00 (task 7e355fe5)'
)
ON CONFLICT DO NOTHING;
