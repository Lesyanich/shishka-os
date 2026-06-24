-- 311_staff_task_stock_waste_categories.sql
-- Two new staff_tasks work-type categories so the kitchen board can visually
-- separate the operational fronts the owner thinks in:
--   stock_check — counting / ordering stock      (SOP deep-links to /stock)
--   waste       — date/FIFO checks & write-offs   (SOP deep-links to /kitchen/waste)
--
-- Widens the category CHECK and re-tags the existing SOP templates + their
-- already-materialized instances by their deep-link. Additive + idempotent.

ALTER TABLE public.staff_tasks DROP CONSTRAINT IF EXISTS staff_tasks_category_check;
ALTER TABLE public.staff_tasks ADD CONSTRAINT staff_tasks_category_check
  CHECK (category IN (
    'opening', 'closing', 'prep', 'cleaning', 'admin', 'general',
    'stock_check', 'waste'
  ));

-- Re-tag by deep link (templates + concrete tasks; ~3 rows each as of 2026-06-24).
-- The `category <> …` guard keeps this idempotent on re-run.
UPDATE public.staff_tasks SET category = 'stock_check'
  WHERE linked_route ILIKE '%/stock%' AND category <> 'stock_check';
UPDATE public.staff_tasks SET category = 'waste'
  WHERE linked_route ILIKE '%/waste%' AND category <> 'waste';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('311_staff_task_stock_waste_categories.sql', 'claude-code',
  'Add staff_tasks categories stock_check + waste; re-tag SOP tasks by linked_route (/stock, /kitchen/waste).')
ON CONFLICT (filename) DO NOTHING;
