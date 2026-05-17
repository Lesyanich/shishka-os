-- Migration 183: nomenclature_modifier_options m2m + 7 allergen tags
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.5
-- - m2m: SALE-* dishes <-> MOD-* modifiers with price_delta + is_default + sort_order
-- - allergen tags: 7 standard slugs in existing tags table (group='allergen' enum already exists)

BEGIN;

CREATE TABLE IF NOT EXISTS public.nomenclature_modifier_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id      UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  modifier_id  UUID NOT NULL REFERENCES nomenclature(id) ON DELETE RESTRICT,
  price_delta  NUMERIC NOT NULL DEFAULT 0,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dish_modifier UNIQUE (dish_id, modifier_id)
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_dish
  ON public.nomenclature_modifier_options(dish_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_modifier
  ON public.nomenclature_modifier_options(modifier_id);

-- Type guard: dish_id -> SALE-*, modifier_id -> MOD-*
CREATE OR REPLACE FUNCTION fn_modifier_options_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_dish_code TEXT; v_mod_code TEXT;
BEGIN
  SELECT product_code INTO v_dish_code FROM nomenclature WHERE id = NEW.dish_id;
  SELECT product_code INTO v_mod_code  FROM nomenclature WHERE id = NEW.modifier_id;

  IF v_dish_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'modifier_options.dish_id must reference SALE-* (got %)', v_dish_code;
  END IF;
  IF v_mod_code NOT LIKE 'MOD-%' THEN
    RAISE EXCEPTION 'modifier_options.modifier_id must reference MOD-* (got %)', v_mod_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_modifier_options_type_guard ON public.nomenclature_modifier_options;
CREATE TRIGGER trg_modifier_options_type_guard
  BEFORE INSERT OR UPDATE ON public.nomenclature_modifier_options
  FOR EACH ROW EXECUTE FUNCTION fn_modifier_options_type_guard();

ALTER TABLE public.nomenclature_modifier_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mod_opts_anon_read ON public.nomenclature_modifier_options;
CREATE POLICY mod_opts_anon_read ON public.nomenclature_modifier_options
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS mod_opts_auth_full ON public.nomenclature_modifier_options;
CREATE POLICY mod_opts_auth_full ON public.nomenclature_modifier_options
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='nomenclature_modifier_options'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nomenclature_modifier_options;
  END IF;
END $$;

-- Allergen tags ALREADY EXIST in the tags table with `allergen-*` prefix convention:
--   allergen-gluten, allergen-dairy, allergen-nuts, allergen-soy, allergen-eggs,
--   allergen-fish, allergen-shellfish, allergen-sesame  (8 tags, sort_order 1..8)
-- We reuse this existing canonical set. Migration only seeds Thai labels if missing.
-- (Originally this migration proposed 7 simpler slugs; superseded by existing convention.)
UPDATE public.tags SET name_th = 'กลูเตน'             WHERE slug = 'allergen-gluten'    AND name_th IS NULL;
UPDATE public.tags SET name_th = 'นม'                 WHERE slug = 'allergen-dairy'     AND name_th IS NULL;
UPDATE public.tags SET name_th = 'ถั่ว'                WHERE slug = 'allergen-nuts'      AND name_th IS NULL;
UPDATE public.tags SET name_th = 'ถั่วเหลือง'           WHERE slug = 'allergen-soy'       AND name_th IS NULL;
UPDATE public.tags SET name_th = 'ไข่'                WHERE slug = 'allergen-eggs'      AND name_th IS NULL;
UPDATE public.tags SET name_th = 'ปลา'                WHERE slug = 'allergen-fish'      AND name_th IS NULL;
UPDATE public.tags SET name_th = 'อาหารทะเลเปลือกแข็ง'  WHERE slug = 'allergen-shellfish' AND name_th IS NULL;
UPDATE public.tags SET name_th = 'งา'                 WHERE slug = 'allergen-sesame'    AND name_th IS NULL;

-- Cleanup: remove unattached simpler-slug duplicates from a prior run of this migration.
-- Idempotent: only deletes the 7 if they are NOT linked to any nomenclature_tags row.
DELETE FROM public.tags t
WHERE t.tag_group = 'allergen'
  AND t.slug IN ('gluten','dairy','nuts','shellfish','soy','egg','sesame')
  AND NOT EXISTS (SELECT 1 FROM public.nomenclature_tags nt WHERE nt.tag_id = t.id);

COMMENT ON TABLE public.nomenclature_modifier_options IS 'SALE dish <-> MOD modifier offerings shown to customer. price_delta added to dish price when selected.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '183_modifier_options_and_allergens.sql',
  'claude-code',
  'New m2m nomenclature_modifier_options + 7 allergen tags (gluten/dairy/nuts/shellfish/soy/egg/sesame).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
