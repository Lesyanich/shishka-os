-- Migration 237 — RLS read policies for the Loyverse modifier mirror tables.
-- MC 38911fde.
--
-- Bug: pos_loyverse_modifier_lists + pos_loyverse_modifier_options had RLS ENABLED
-- but ZERO policies (default deny) — so the admin (anon/authenticated) read empty and
-- /menu/modifiers showed "No modifier groups pulled yet", even though the mirror has
-- rows. The edge fn refreshes them under the service role (bypasses RLS), which masked
-- the gap. These are read-only mirrors for the app, so anon/authenticated need SELECT.
-- Writes stay service-role-only (no write policy) — the app never writes the mirror.

BEGIN;

ALTER TABLE public.pos_loyverse_modifier_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_loyverse_modifier_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_mod_lists_read ON public.pos_loyverse_modifier_lists;
CREATE POLICY pos_mod_lists_read ON public.pos_loyverse_modifier_lists
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS pos_mod_options_read ON public.pos_loyverse_modifier_options;
CREATE POLICY pos_mod_options_read ON public.pos_loyverse_modifier_options
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '243a_modifier_mirror_rls_read.sql',
  'claude-code',
  'Add anon/authenticated SELECT policies to pos_loyverse_modifier_lists/options (RLS was enabled with 0 policies -> deny-all -> /menu/modifiers read empty). Read-only mirror; writes stay service-role. MC 38911fde.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
