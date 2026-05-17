-- Migration 185: fn_dish_card_save — atomic save for SALE dish card
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Atomic save of nomenclature fields + dish_card fields + version bump + verified pointer.
-- Optimistic locking via expected_version. Returns {ok, new_version} or {conflict:{current_version}}.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dish_card_save(
  p_dish_id  UUID,
  p_payload  JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_expected_version INT;
  v_current_version  INT;
  v_dish_code        TEXT;
  v_new_version      INT;
  v_user_id          UUID;
  v_dc_payload       JSONB;
BEGIN
  -- 1. Validate dish exists + is SALE
  SELECT product_code, card_version
    INTO v_dish_code, v_current_version
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF v_dish_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;
  IF v_dish_code NOT LIKE 'SALE-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_sale_dish', 'product_code', v_dish_code);
  END IF;

  -- 2. Optimistic lock check
  v_expected_version := (p_payload->>'expected_version')::INT;
  IF v_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expected_version_required');
  END IF;

  IF v_current_version <> v_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'conflict', jsonb_build_object('current_version', v_current_version)
    );
  END IF;

  v_user_id := auth.uid();
  v_new_version := v_current_version + 1;

  -- 3. Update nomenclature row (only fields present in payload)
  UPDATE public.nomenclature SET
    customer_description = COALESCE(p_payload->>'customer_description', customer_description),
    customer_short_name  = COALESCE(p_payload->>'customer_short_name',  customer_short_name),
    customer_photo_url   = COALESCE(p_payload->>'customer_photo_url',   customer_photo_url),
    assembler_note       = COALESCE(p_payload->>'assembler_note',       assembler_note),
    merrychef_program    = COALESCE(p_payload->'merrychef_program',     merrychef_program),
    ttc_source_url       = COALESCE(p_payload->>'ttc_source_url',       ttc_source_url),
    card_version         = v_new_version,
    last_verified_at     = now(),
    last_verified_by     = v_user_id
  WHERE id = p_dish_id;

  -- 4. Upsert dish_card
  v_dc_payload := COALESCE(p_payload->'dish_card', '{}'::jsonb);

  INSERT INTO public.dish_card (
    nomenclature_id, container_l2, assembly_order, pre_merrychef_prep, post_merrychef_check,
    cold_addons_after_reheat, has_cutlery, has_lid_sticker, assembler_photo_url,
    customer_eta_min, composition_override
  ) VALUES (
    p_dish_id,
    v_dc_payload->>'container_l2',
    v_dc_payload->'assembly_order',
    v_dc_payload->>'pre_merrychef_prep',
    v_dc_payload->>'post_merrychef_check',
    v_dc_payload->>'cold_addons_after_reheat',
    COALESCE((v_dc_payload->>'has_cutlery')::BOOLEAN, false),
    COALESCE((v_dc_payload->>'has_lid_sticker')::BOOLEAN, false),
    v_dc_payload->>'assembler_photo_url',
    NULLIF(v_dc_payload->>'customer_eta_min', '')::INT,
    v_dc_payload->>'composition_override'
  )
  ON CONFLICT (nomenclature_id) DO UPDATE SET
    container_l2             = COALESCE(EXCLUDED.container_l2,             dish_card.container_l2),
    assembly_order           = COALESCE(EXCLUDED.assembly_order,           dish_card.assembly_order),
    pre_merrychef_prep       = COALESCE(EXCLUDED.pre_merrychef_prep,       dish_card.pre_merrychef_prep),
    post_merrychef_check     = COALESCE(EXCLUDED.post_merrychef_check,     dish_card.post_merrychef_check),
    cold_addons_after_reheat = COALESCE(EXCLUDED.cold_addons_after_reheat, dish_card.cold_addons_after_reheat),
    has_cutlery              = EXCLUDED.has_cutlery,
    has_lid_sticker          = EXCLUDED.has_lid_sticker,
    assembler_photo_url      = COALESCE(EXCLUDED.assembler_photo_url,      dish_card.assembler_photo_url),
    customer_eta_min         = COALESCE(EXCLUDED.customer_eta_min,         dish_card.customer_eta_min),
    composition_override     = COALESCE(EXCLUDED.composition_override,     dish_card.composition_override);

  RETURN jsonb_build_object('ok', true, 'new_version', v_new_version);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dish_card_save(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_dish_card_save(UUID, JSONB) IS
  'Atomic Save & Verify for a SALE dish: updates nomenclature card fields + upserts dish_card + bumps card_version. Optimistic lock via payload.expected_version.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '185_rpc_dish_card_save.sql',
  'claude-code',
  'fn_dish_card_save RPC with optimistic locking + version bump + verified pointer.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
