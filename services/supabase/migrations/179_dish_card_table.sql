-- Migration 179: dish_card — L2 Assembler 1:1 extension for SALE-* dishes
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.2
-- Carries: container_l2, assembly_order, pre/post Merrychef checks, cold add-ons,
--          cutlery/sticker flags, assembler photo, customer ETA, composition override.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dish_card (
  nomenclature_id           UUID PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
  container_l2              TEXT,
  assembly_order            JSONB,
  pre_merrychef_prep        TEXT,
  post_merrychef_check      TEXT,
  cold_addons_after_reheat  TEXT,
  has_cutlery               BOOLEAN NOT NULL DEFAULT false,
  has_lid_sticker           BOOLEAN NOT NULL DEFAULT false,
  assembler_photo_url       TEXT,
  customer_eta_min          INT,
  composition_override      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- assembly_order JSONB shape validation: array of {step, text} objects.
-- Postgres CHECK does not allow subqueries, so use a BEFORE-trigger function instead.
CREATE OR REPLACE FUNCTION fn_dish_card_assembly_order_validate()
RETURNS TRIGGER AS $$
DECLARE
  v_elem JSONB;
BEGIN
  IF NEW.assembly_order IS NULL THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.assembly_order) <> 'array' THEN
    RAISE EXCEPTION 'dish_card.assembly_order must be a JSONB array (got %)', jsonb_typeof(NEW.assembly_order);
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements(NEW.assembly_order)
  LOOP
    IF NOT (v_elem ? 'step' AND v_elem ? 'text') THEN
      RAISE EXCEPTION 'dish_card.assembly_order element missing required keys {step,text}: %', v_elem;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dish_card_assembly_order_validate ON public.dish_card;
CREATE TRIGGER trg_dish_card_assembly_order_validate
  BEFORE INSERT OR UPDATE OF assembly_order ON public.dish_card
  FOR EACH ROW EXECUTE FUNCTION fn_dish_card_assembly_order_validate();

-- Only SALE-* dishes can have a dish_card
CREATE OR REPLACE FUNCTION fn_dish_card_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_code TEXT;
BEGIN
  SELECT product_code INTO v_code FROM nomenclature WHERE id = NEW.nomenclature_id;
  IF v_code IS NULL OR v_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'dish_card.nomenclature_id must reference SALE-* item (got %)', v_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dish_card_type_guard ON public.dish_card;
CREATE TRIGGER trg_dish_card_type_guard
  BEFORE INSERT OR UPDATE OF nomenclature_id ON public.dish_card
  FOR EACH ROW EXECUTE FUNCTION fn_dish_card_type_guard();

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION fn_dish_card_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dish_card_updated_at ON public.dish_card;
CREATE TRIGGER trg_dish_card_updated_at
  BEFORE UPDATE ON public.dish_card
  FOR EACH ROW EXECUTE FUNCTION fn_dish_card_updated_at();

-- RLS: anon SELECT (for future POS preview), authenticated ALL
ALTER TABLE public.dish_card ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dish_card_anon_read ON public.dish_card;
CREATE POLICY dish_card_anon_read ON public.dish_card
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dish_card_auth_full ON public.dish_card;
CREATE POLICY dish_card_auth_full ON public.dish_card
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dish_card'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dish_card;
  END IF;
END $$;

COMMENT ON TABLE public.dish_card IS 'L2 Assembler 1:1 extension for SALE-* dishes — plating, container, Merrychef pre/post, customer ETA.';

-- Register
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '179_dish_card_table.sql',
  'claude-code',
  'New dish_card table (1:1 with SALE-* nomenclature). Carries L2 Assembler structured fields per menu-card-full spec.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
