-- 347_shift_hours_0900_1800.sql
-- CEO 2026-07-03: the correct kitchen working hours are 09:00–18:00. Normalize every
-- existing shift to 09:00–18:00 — this covers the old 08:00–17:00 bulk default (200 rows)
-- and the 24 legacy evening 11:00–19:00 rows. Going-forward UI defaults (ShiftEditor,
-- BulkScheduleGenerator, ScheduleTemplatePanel) are fixed to 09:00–18:00 in the same PR.
--
-- Reversible: each shift's original times are snapshotted into shifts_hours_backup_pre347
-- BEFORE the update. To roll back:
--   UPDATE shifts s SET start_time = b.old_start_time, end_time = b.old_end_time, updated_at = now()
--     FROM shifts_hours_backup_pre347 b WHERE s.id = b.shift_id;
--
-- Idempotent: backup table is created IF NOT EXISTS and rows inserted ON CONFLICT DO NOTHING
-- (first run wins, so a re-run never overwrites the true originals); the UPDATE only touches
-- rows not already at 09:00–18:00.

BEGIN;

CREATE TABLE IF NOT EXISTS shifts_hours_backup_pre347 (
  shift_id       uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  old_start_time time NOT NULL,
  old_end_time   time NOT NULL,
  backed_up_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO shifts_hours_backup_pre347 (shift_id, old_start_time, old_end_time)
SELECT id, start_time, end_time FROM shifts
ON CONFLICT (shift_id) DO NOTHING;

UPDATE shifts
   SET start_time = '09:00:00',
       end_time   = '18:00:00',
       updated_at = now()
 WHERE start_time <> '09:00:00' OR end_time <> '18:00:00';

INSERT INTO migration_log (filename, status, notes)
VALUES (
  '347_shift_hours_0900_1800.sql',
  'success',
  'CEO 2026-07-03: normalized ALL shifts to 09:00-18:00 (was ~200 rows at 08:00-17:00 + 24 evening 11:00-19:00 + 1 already 09:00-18:00). Originals snapshotted in shifts_hours_backup_pre347 for one-line rollback. UI defaults fixed to 09:00-18:00 in the same PR.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
