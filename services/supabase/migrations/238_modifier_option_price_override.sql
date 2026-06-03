-- Migration 238 — admin-staged price per Loyverse modifier OPTION. MC 38911fde.
--
-- CEO wants to edit an option's selling price inside the admin. But changing a
-- modifier in Loyverse detaches it from all items (verified quirk), so price edits
-- must be STAGED in admin and applied via the orchestrated Push (Phase 5), which
-- re-attaches affected dishes last. This table is that staging area: the admin's
-- desired price per option. UI shows "needs push" when it differs from the mirror
-- (pos_loyverse_modifier_options.price). Soft ref to the mirror (no FK — the mirror
-- is wipe-and-reloaded each pull; the Loyverse option id is stable).

BEGIN;

CREATE TABLE IF NOT EXISTS public.modifier_option_overrides (
  loyverse_modifier_option_id TEXT PRIMARY KEY,
  price                       NUMERIC NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_modifier_option_overrides_updated_at ON public.modifier_option_overrides;
CREATE TRIGGER trg_modifier_option_overrides_updated_at
  BEFORE UPDATE ON public.modifier_option_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE public.modifier_option_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mod_opt_override_anon_read ON public.modifier_option_overrides;
CREATE POLICY mod_opt_override_anon_read ON public.modifier_option_overrides
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS mod_opt_override_auth_full ON public.modifier_option_overrides;
CREATE POLICY mod_opt_override_auth_full ON public.modifier_option_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.modifier_option_overrides IS
  'Admin-staged selling price per Loyverse modifier option, pending push to Loyverse (Phase 5). Differs-from-mirror = "needs push". Soft ref to pos_loyverse_modifier_options (no FK: mirror is wipe-and-reloaded). MC 38911fde.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='modifier_option_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.modifier_option_overrides;
  END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '238_modifier_option_price_override.sql',
  'claude-code',
  'modifier_option_overrides — admin-staged option price pending Loyverse push (Phase 5). RLS anon read / authenticated full. MC 38911fde.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
