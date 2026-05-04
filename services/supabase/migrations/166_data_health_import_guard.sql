-- ============================================================
-- Migration 166: Import guard — fuzzy dedup + packaging auto-tag
-- MC task 39add9cb
--
-- Trigger on nomenclature INSERT for RAW-AUTO items:
--   1. Fuzzy-match name against existing active RAW items (pg_trgm)
--   2. If match found → set is_available=false, queue in unmatched_items
--   3. Detect packaging keywords → auto-tag 'packaging'
--
-- Safety: AFTER INSERT trigger — never blocks the insert, only flags.
-- ============================================================

BEGIN;

-- ── Step 1: Create 'packaging' tag ──
INSERT INTO public.tags (slug, name, name_th, tag_group, color, sort_order)
VALUES ('packaging', 'Packaging', 'บรรจุภัณฑ์', 'ops', '#6b7280', 0)
ON CONFLICT (slug) DO NOTHING;

-- ── Step 2: Trigger function ──
CREATE OR REPLACE FUNCTION public.fn_nomenclature_import_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id      UUID;
  v_match_name    TEXT;
  v_match_score   NUMERIC;
  v_is_packaging  BOOLEAN;
  v_packaging_tag UUID;
  v_packaging_keywords TEXT[] := ARRAY[
    'bag', 'box', 'lid', 'paper', 'container', 'wrap', 'cup', 'straw',
    'napkin', 'foil', 'tray', 'sleeve', 'label', 'ribbon', 'tape',
    'glove', 'apron', 'towel', 'sponge', 'detergent', 'sanitizer'
  ];
  v_kw TEXT;
BEGIN
  -- Only process RAW-AUTO items
  IF NEW.product_code NOT LIKE 'RAW-AUTO-%' THEN
    RETURN NEW;
  END IF;

  -- ── Fuzzy dedup check ──
  -- Find best match among active, non-AUTO RAW items
  SELECT n.id, n.name, similarity(lower(NEW.name), lower(n.name))
  INTO v_match_id, v_match_name, v_match_score
  FROM public.nomenclature n
  WHERE n.id != NEW.id
    AND n.product_code LIKE 'RAW-%'
    AND n.product_code NOT LIKE 'RAW-AUTO-%'
    AND n.is_available = true
    AND similarity(lower(NEW.name), lower(n.name)) > 0.4
  ORDER BY similarity(lower(NEW.name), lower(n.name)) DESC
  LIMIT 1;

  IF v_match_id IS NOT NULL THEN
    -- Flag as potential duplicate: deactivate and queue for review
    UPDATE public.nomenclature
    SET is_available = false
    WHERE id = NEW.id;

    INSERT INTO public.unmatched_items (
      raw_text, suggested_match, confidence
    ) VALUES (
      NEW.name || ' [RAW-AUTO: ' || NEW.product_code || ']',
      v_match_id,
      LEAST(v_match_score, 1.0)
    );
  END IF;

  -- ── Packaging keyword detection ──
  v_is_packaging := false;
  FOREACH v_kw IN ARRAY v_packaging_keywords LOOP
    IF lower(NEW.name) LIKE '%' || v_kw || '%' THEN
      v_is_packaging := true;
      EXIT;
    END IF;
  END LOOP;

  IF v_is_packaging THEN
    SELECT id INTO v_packaging_tag FROM public.tags WHERE slug = 'packaging';
    IF v_packaging_tag IS NOT NULL THEN
      INSERT INTO public.nomenclature_tags (nomenclature_id, tag_id)
      VALUES (NEW.id, v_packaging_tag)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_nomenclature_import_guard()
  IS 'Import guard: on RAW-AUTO insert, fuzzy-matches against existing RAW items (deactivates + queues duplicates) and auto-tags packaging keywords.';

-- ── Step 3: Trigger (AFTER INSERT, only for RAW-AUTO rows) ──
DROP TRIGGER IF EXISTS trg_nomenclature_import_guard ON public.nomenclature;

CREATE TRIGGER trg_nomenclature_import_guard
  AFTER INSERT ON public.nomenclature
  FOR EACH ROW
  WHEN (NEW.product_code LIKE 'RAW-AUTO-%')
  EXECUTE FUNCTION public.fn_nomenclature_import_guard();

COMMIT;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '166_data_health_import_guard.sql',
  'claude-code',
  NULL,
  'Import guard trigger: fuzzy dedup (pg_trgm >0.4) for RAW-AUTO + packaging keyword auto-tag. MC 39add9cb.'
) ON CONFLICT (filename) DO NOTHING;
