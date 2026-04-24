-- ============================================================
-- Migration 151: Approval Diff Engine
-- fn_learn_from_approval — extracts correction rules from the diff
-- between OCR output and approved payload.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_learn_from_approval(
  p_inbox_id UUID,
  p_approved JSONB,
  p_supplier_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original JSONB;
  v_orig_item JSONB;
  v_appr_item JSONB;
  v_orig_cat TEXT;
  v_appr_cat TEXT;
  v_item_name TEXT;
  v_rules_created INTEGER := 0;
  v_i INTEGER;
  v_base_barcode TEXT;
  v_barcode TEXT;
BEGIN
  -- Get original parsed payload (OCR output before user edits)
  SELECT parsed_payload INTO v_original
  FROM public.receipt_inbox
  WHERE id = p_inbox_id;

  IF v_original IS NULL THEN RETURN 0; END IF;

  -- ── Learn category corrections from line_items ──
  FOR v_i IN 0..GREATEST(jsonb_array_length(COALESCE(v_original->'line_items', '[]'::jsonb)) - 1, -1)
  LOOP
    v_orig_item := v_original->'line_items'->v_i;
    IF v_orig_item IS NULL THEN CONTINUE; END IF;

    v_item_name := LOWER(COALESCE(v_orig_item->>'translated_name', v_orig_item->>'original_name', ''));
    IF v_item_name = '' THEN CONTINUE; END IF;

    v_orig_cat := COALESCE(v_orig_item->>'category', 'food');

    -- Find this item in approved payload by matching name
    v_appr_cat := NULL;

    -- Check food_items
    FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'food_items', '[]'::jsonb))
    LOOP
      IF LOWER(COALESCE(v_appr_item->>'name', '')) = v_item_name
         OR LOWER(COALESCE(v_appr_item->>'original_name', '')) = LOWER(COALESCE(v_orig_item->>'original_name', '')) THEN
        v_appr_cat := 'food';
        EXIT;
      END IF;
    END LOOP;

    -- Check opex_items
    IF v_appr_cat IS NULL THEN
      FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'opex_items', '[]'::jsonb))
      LOOP
        IF LOWER(COALESCE(v_appr_item->>'description', v_appr_item->>'name', '')) = v_item_name
           OR LOWER(COALESCE(v_appr_item->>'original_name', '')) = LOWER(COALESCE(v_orig_item->>'original_name', '')) THEN
          v_appr_cat := 'opex';
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Check capex_items
    IF v_appr_cat IS NULL THEN
      FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'capex_items', '[]'::jsonb))
      LOOP
        IF LOWER(COALESCE(v_appr_item->>'name', '')) = v_item_name
           OR LOWER(COALESCE(v_appr_item->>'original_name', '')) = LOWER(COALESCE(v_orig_item->>'original_name', '')) THEN
          v_appr_cat := 'capex';
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- If category changed, create override
    IF v_appr_cat IS NOT NULL AND v_orig_cat <> v_appr_cat THEN
      INSERT INTO public.category_overrides (match_pattern, flow_type, supplier_id, source)
      VALUES (
        v_item_name,
        CASE v_appr_cat WHEN 'food' THEN 'COGS' WHEN 'opex' THEN 'OpEx' WHEN 'capex' THEN 'CapEx' END,
        p_supplier_id,
        'approval_diff'
      )
      ON CONFLICT DO NOTHING;
      v_rules_created := v_rules_created + 1;
    END IF;

    -- ── Learn GS1 weight items ──
    v_barcode := v_orig_item->>'barcode';
    IF v_barcode IS NOT NULL AND LEFT(v_barcode, 1) = '2' AND LENGTH(v_barcode) > 13 THEN
      v_base_barcode := LEFT(v_barcode, 13);
      -- Find nomenclature_id from approved food_items by matching barcode prefix
      FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'food_items', '[]'::jsonb))
      LOOP
        IF (v_appr_item->>'nomenclature_id') IS NOT NULL
           AND LEFT(COALESCE(v_appr_item->>'barcode', ''), 13) = v_base_barcode THEN
          INSERT INTO public.gs1_weight_items (base_barcode, nomenclature_id, supplier_id, description)
          VALUES (
            v_base_barcode,
            (v_appr_item->>'nomenclature_id')::UUID,
            p_supplier_id,
            v_appr_item->>'name'
          )
          ON CONFLICT (base_barcode) DO UPDATE SET
            nomenclature_id = EXCLUDED.nomenclature_id,
            description = EXCLUDED.description;
          v_rules_created := v_rules_created + 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_rules_created;
END;
$$;

COMMENT ON FUNCTION public.fn_learn_from_approval(UUID, JSONB, UUID)
  IS 'Extract correction rules from diff between OCR output and approved payload. Creates category_overrides and gs1_weight_items entries.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '151_approval_diff_engine.sql',
  'claude-code',
  'fn_learn_from_approval: extracts category overrides and GS1 weight items from approval diffs'
) ON CONFLICT (filename) DO NOTHING;
