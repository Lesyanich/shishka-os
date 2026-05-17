-- Migration 181: nomenclature card extension
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.1
-- Absorbs MC e696afe3 (3 desc fields) and MC 68dbc8ec (merrychef_program).
-- Adds 10 cross-cutting card fields: 3 descriptions, 2 customer-facing, merrychef program,
-- TTC link, version counter, last-verified pointer (at + by).

BEGIN;

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS customer_description  TEXT,
  ADD COLUMN IF NOT EXISTS customer_short_name   TEXT,
  ADD COLUMN IF NOT EXISTS customer_photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS assembler_note        TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_note          TEXT,
  ADD COLUMN IF NOT EXISTS merrychef_program     JSONB,
  ADD COLUMN IF NOT EXISTS ttc_source_url        TEXT,
  ADD COLUMN IF NOT EXISTS card_version          INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_by      UUID REFERENCES auth.users(id);

-- merrychef_program JSONB shape: must have temp_c + time_sec when present
-- (uses ? operator, NOT subquery, so safe in CHECK)
ALTER TABLE public.nomenclature
  DROP CONSTRAINT IF EXISTS chk_merrychef_program_shape;
ALTER TABLE public.nomenclature
  ADD CONSTRAINT chk_merrychef_program_shape CHECK (
    merrychef_program IS NULL OR (
      jsonb_typeof(merrychef_program) = 'object'
      AND (merrychef_program ? 'temp_c')
      AND (merrychef_program ? 'time_sec')
    )
  );

-- card_version monotonicity (cannot decrease)
CREATE OR REPLACE FUNCTION fn_card_version_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.card_version < OLD.card_version THEN
    RAISE EXCEPTION 'card_version cannot decrease (was %, attempt %)', OLD.card_version, NEW.card_version;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_card_version_monotonic ON public.nomenclature;
CREATE TRIGGER trg_card_version_monotonic
  BEFORE UPDATE OF card_version ON public.nomenclature
  FOR EACH ROW EXECUTE FUNCTION fn_card_version_monotonic();

COMMENT ON COLUMN public.nomenclature.customer_description IS 'POS/website-facing description (only field synced to Loyverse description).';
COMMENT ON COLUMN public.nomenclature.customer_short_name  IS 'Short POS button label; falls back to name if NULL.';
COMMENT ON COLUMN public.nomenclature.customer_photo_url   IS 'Public URL to dish-photos bucket — customer-facing photo.';
COMMENT ON COLUMN public.nomenclature.assembler_note       IS 'L2 Assembler freeform note: critical reminders during assembly.';
COMMENT ON COLUMN public.nomenclature.kitchen_note         IS 'L1 Cook freeform note: critical reminders during production.';
COMMENT ON COLUMN public.nomenclature.merrychef_program    IS 'JSONB {temp_c, time_sec, fan_pct, microwave_pct, notes} — Merrychef preset.';
COMMENT ON COLUMN public.nomenclature.ttc_source_url       IS 'External link to source TTC document (GDrive / Notion).';
COMMENT ON COLUMN public.nomenclature.card_version         IS 'Monotonic version counter — bumped on every Save & Verify.';
COMMENT ON COLUMN public.nomenclature.last_verified_at     IS 'Timestamp of last Save & Verify action.';
COMMENT ON COLUMN public.nomenclature.last_verified_by     IS 'auth.users(id) of the user who last verified this card.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '181_nomenclature_card_extension.sql',
  'claude-code',
  '10 new card columns on nomenclature. Absorbs MC e696afe3 (3 desc fields) + MC 68dbc8ec (merrychef_program).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
