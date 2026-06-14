-- Migration 273: tag recipe steps with a location (station)
-- Each assembly/prep step happens at a specific station — prep work in the
-- central Kitchen (L1) vs final assembly at the point Assembly (L2). Storing the
-- location structurally (FK to locations) lets the daily-plan generator fan each
-- step out into production_tasks for the right station, which the Telegram bot
-- then assigns (production_tasks.assigned_tg_user_id).
--
-- Mapping for now: locations.Kitchen = L1-type prep, locations.Assembly = L2-type
-- assembly. Nullable: legacy steps stay unassigned until reviewed.

BEGIN;

ALTER TABLE public.recipes_flow
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

COMMENT ON COLUMN public.recipes_flow.location_id IS
  'Station where this step runs (FK locations). Kitchen=L1 prep, Assembly=L2 assembly. Drives daily-plan → production_tasks fan-out.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '273_recipes_flow_location.sql',
  'claude-code',
  'Add recipes_flow.location_id (FK locations) to tag steps by station for daily-plan/bot fan-out.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
