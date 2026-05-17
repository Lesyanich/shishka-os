-- Migration 180: pf_pack_card — L1 Pack/Storage 1:1 extension for PF-* items
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.3
-- Carries: batch yield, vacuum bag format, label template, shelf life, storage zone/temp, good-batch photo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pf_pack_card (
  nomenclature_id        UUID PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
  batch_input_qty        NUMERIC,
  batch_input_uom        TEXT,
  portions_per_batch     NUMERIC,
  portion_weight_g       NUMERIC,
  vacuum_bag_size        TEXT,
  fill_weight_per_bag_g  NUMERIC,
  portions_per_bag       NUMERIC,
  label_template         JSONB,
  shelf_life_days        INT,
  storage_zone           TEXT,
  storage_temp_min_c     NUMERIC,
  storage_temp_max_c     NUMERIC,
  kitchen_photo_url      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_temp_range CHECK (
    storage_temp_min_c IS NULL OR storage_temp_max_c IS NULL
    OR storage_temp_min_c <= storage_temp_max_c
  )
);

-- Only PF-* items can have a pf_pack_card
CREATE OR REPLACE FUNCTION fn_pf_pack_card_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_code TEXT;
BEGIN
  SELECT product_code INTO v_code FROM nomenclature WHERE id = NEW.nomenclature_id;
  IF v_code IS NULL OR v_code NOT LIKE 'PF-%' THEN
    RAISE EXCEPTION 'pf_pack_card.nomenclature_id must reference PF-* item (got %)', v_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pf_pack_card_type_guard ON public.pf_pack_card;
CREATE TRIGGER trg_pf_pack_card_type_guard
  BEFORE INSERT OR UPDATE OF nomenclature_id ON public.pf_pack_card
  FOR EACH ROW EXECUTE FUNCTION fn_pf_pack_card_type_guard();

CREATE OR REPLACE FUNCTION fn_pf_pack_card_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pf_pack_card_updated_at ON public.pf_pack_card;
CREATE TRIGGER trg_pf_pack_card_updated_at
  BEFORE UPDATE ON public.pf_pack_card
  FOR EACH ROW EXECUTE FUNCTION fn_pf_pack_card_updated_at();

ALTER TABLE public.pf_pack_card ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pf_pack_card_anon_read ON public.pf_pack_card;
CREATE POLICY pf_pack_card_anon_read ON public.pf_pack_card
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS pf_pack_card_auth_full ON public.pf_pack_card;
CREATE POLICY pf_pack_card_auth_full ON public.pf_pack_card
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pf_pack_card'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pf_pack_card;
  END IF;
END $$;

COMMENT ON TABLE public.pf_pack_card IS 'L1 Cook 1:1 extension for PF-* items — batch yield, vacuum pack format, storage, label template.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '180_pf_pack_card_table.sql',
  'claude-code',
  'New pf_pack_card table (1:1 with PF-* nomenclature). Carries L1 pack/storage fields per menu-card-full spec.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
