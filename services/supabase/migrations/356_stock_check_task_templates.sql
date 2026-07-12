-- 356_stock_check_task_templates.sql
-- Station stock v1 (S3). Recurring stock-count staff tasks, one per front-of-
-- house station, so "count the Bar" shows up on the floor on its own cadence
-- instead of relying on someone remembering. MC 563af492 (initiative 8b709aa0).
--
-- These are staff_tasks TEMPLATES (is_template=true) that the existing cron
-- (mig 276a: fn_materialize_recurring_tasks @ 00:25 ICT) turns into concrete
-- 'todo' tasks on the due day. Each links (linked_route) to /count/<code> —
-- the per-station count screen (StationCountPage, cook-reachable) — so a cook
-- taps the task and lands straight on that station's checklist.
--
-- Cadence = ABC (mig 350): perishable-heavy stations counted daily, frozen/dry
-- stations weekly (Monday, dow=1). category='stock_check' (mig 311). station is
-- the FLOOR code (L1/L2/general) the materializer copies — all five here are L2
-- front counters. Idempotent: skipped if a stock_check template already points
-- at that /count/<code>.

INSERT INTO public.staff_tasks
  (title, title_th, description, category, priority, status, station,
   recurrence, recurrence_days, is_template, due_time, reminder_offset_min,
   linked_route, linked_label, linked_label_th, created_by)
SELECT v.title, v.title_th, v.description, 'stock_check', 'medium', 'todo', v.station,
       v.recurrence, v.recurrence_days, true, '09:00', 30,
       v.linked_route, 'Open count', 'เปิดการนับ', 'stock-v1'
FROM (VALUES
  -- code,        title,               title_th,             station, recurrence, days,               description
  ('bar',        'Count: Bar',        'นับสต็อก: บาร์',       'L2', 'daily',  NULL::int[],  'Daily count — fresh juices, dairy, fruit (A-class perishables).'),
  ('salad-bar',  'Count: Salad Bar',  'นับสต็อก: สลัดบาร์',   'L2', 'daily',  NULL::int[],  'Daily count — greens, proteins, cut veg (A-class perishables).'),
  ('manakish',   'Count: Manakish',   'นับสต็อก: มานาคีช',    'L2', 'weekly', ARRAY[1],     'Weekly count (Mon) — frozen assembled manakish + packaging.'),
  ('chocolate',  'Count: Chocolate',  'นับสต็อก: ช็อกโกแลต',  'L2', 'weekly', ARRAY[1],     'Weekly count (Mon) — chocolate counter stock.'),
  ('bread',      'Count: Bread',      'นับสต็อก: ขนมปัง',     'L2', 'weekly', ARRAY[1],     'Weekly count (Mon) — held bread/cracker PF bases.')
) AS v(code, title, title_th, station, recurrence, recurrence_days, description)
CROSS JOIN LATERAL (SELECT '/count/' || v.code AS linked_route) lr
WHERE EXISTS (SELECT 1 FROM public.stations s WHERE s.code = v.code AND s.is_active)
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_tasks t
    WHERE t.is_template = true
      AND t.category = 'stock_check'
      AND t.linked_route = '/count/' || v.code
  );

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '356_stock_check_task_templates.sql',
  'claude-code',
  NULL,
  'Station stock v1 S3: 5 recurring stock_check staff_tasks templates (Bar/Salad Bar daily; Manakish/Chocolate/Bread weekly-Mon), linked_route /count/<code>. Materialized by fn_materialize_recurring_tasks (mig 276a cron). Idempotent on (is_template, stock_check, linked_route). MC 563af492.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DELETE FROM public.staff_tasks WHERE is_template = true AND category = 'stock_check'
--   AND linked_route LIKE '/count/%' AND created_by = 'stock-v1';
