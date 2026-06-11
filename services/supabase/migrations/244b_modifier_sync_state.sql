-- Migration 239 — single-row sync state for the modifier admin. MC 38911fde (Phase 5).
--
-- Drives the "Push to Loyverse" status indicator: when modifiers were last pushed /
-- pulled, and whether dish↔group attachments have local edits not yet pushed
-- (attachments_dirty). Price "needs push" is computed precisely from
-- modifier_option_overrides vs the mirror, so it does NOT need a flag here.
--
-- attachments_dirty lifecycle:
--   set TRUE  on any admin attach/detach (dish_modifier_groups write)
--   set FALSE on a successful push  (admin == Loyverse) and on a pull (we just
--             reconciled dish_modifier_groups FROM Loyverse, so they match again).

BEGIN;

CREATE TABLE IF NOT EXISTS public.modifier_sync_state (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  attachments_dirty  BOOLEAN NOT NULL DEFAULT false,
  last_pushed_at     TIMESTAMPTZ,
  last_pulled_at     TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.modifier_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_modifier_sync_state_updated_at ON public.modifier_sync_state;
CREATE TRIGGER trg_modifier_sync_state_updated_at
  BEFORE UPDATE ON public.modifier_sync_state
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE public.modifier_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mod_sync_state_read ON public.modifier_sync_state;
CREATE POLICY mod_sync_state_read ON public.modifier_sync_state
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS mod_sync_state_auth_write ON public.modifier_sync_state;
CREATE POLICY mod_sync_state_auth_write ON public.modifier_sync_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.modifier_sync_state IS
  'Single-row (id=1) modifier sync status: last_pushed_at, last_pulled_at, attachments_dirty. Drives the admin Push-to-Loyverse status indicator. MC 38911fde.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='modifier_sync_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.modifier_sync_state;
  END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '244b_modifier_sync_state.sql',
  'claude-code',
  'modifier_sync_state single-row table (last_pushed_at/last_pulled_at/attachments_dirty) for Push-to-Loyverse status. MC 38911fde Phase 5.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
