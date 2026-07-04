-- 348_staff_task_equipment_foodsafety_categories.sql
-- ⚠ RETRO-COMMITTED: applied live 2026-07-03 12:07 UTC (see migration_log) but
-- the file was never committed — repo↔DB drift found while building the
-- category drift guard (MC 211354fc). The frontend test
-- apps/admin-panel/src/components/tasks/taskMeta.test.ts parses the latest
-- staff_tasks_category_check definition out of this directory, so this file is
-- the offline source of truth for the allowed category set.
--
-- NOTE the number collision with 348_stations_and_categories.sql (PR #479):
-- both are already applied under these exact filenames; migration_log is keyed
-- by filename, so neither file may be renamed.
--
-- Adds two staff task work-type categories:
--   equipment   — machine-maintenance SOPs (weekly/monthly deep cleans, descale)
--   food_safety — HACCP CCP checks (blast chiller daily check)

ALTER TABLE public.staff_tasks DROP CONSTRAINT IF EXISTS staff_tasks_category_check;
ALTER TABLE public.staff_tasks ADD CONSTRAINT staff_tasks_category_check
  CHECK (category IN (
    'opening', 'closing', 'prep', 'cleaning', 'admin', 'general',
    'stock_check', 'waste', 'equipment', 'food_safety'
  ));

-- Re-tag the 12 machine-maintenance SOPs (cleaning → equipment) and the blast
-- chiller CCP (closing → food_safety) by exact title — templates + their
-- already-materialized instances. `category <>` guards keep this idempotent.
UPDATE public.staff_tasks SET category = 'equipment'
 WHERE category <> 'equipment' AND title IN (
   'Blast chiller — monthly coils & seals',
   'Coffee machine — monthly descale & service',
   'Coffee machine — weekly deep clean (hopper, tank, brew unit)',
   'Coffee machine — weekly milk system deep clean',
   'Convection oven — weekly deep clean',
   'Display fridge (bakery) — weekly deep clean',
   'L2 monthly — equipment pull-out & coils',
   'Meat grinder — weekly deep clean',
   'Merrychef — monthly inspection & filter check',
   'Merrychef — weekly deep clean (filter, seal, vents)',
   'Open fridge — weekly deep clean',
   'Vacuum sealer — weekly deep clean'
 );

UPDATE public.staff_tasks SET category = 'food_safety'
 WHERE category <> 'food_safety'
   AND title = 'Blast chiller — daily check & clean (CCP)';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('348_staff_task_equipment_foodsafety_categories.sql', 'claude-code',
  'Add staff_tasks categories equipment + food_safety; re-tag 12 machine-maintenance SOPs (cleaning→equipment) and blast-chiller CCP (closing→food_safety) by exact title.')
ON CONFLICT (filename) DO NOTHING;
