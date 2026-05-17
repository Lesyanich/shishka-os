-- Migration 186: fn_pf_pack_card_save — atomic save for PF pack card
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Same pattern as fn_dish_card_save but for PF-* items (kitchen_note + pf_pack_card fields).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_pf_pack_card_save(
  p_pf_id    UUID,
  p_payload  JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_expected_version INT;
  v_current_version  INT;
  v_pf_code          TEXT;
  v_new_version      INT;
  v_user_id          UUID;
  v_pc_payload       JSONB;
BEGIN
  SELECT product_code, card_version
    INTO v_pf_code, v_current_version
  FROM public.nomenclature
  WHERE id = p_pf_id;

  IF v_pf_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pf_not_found', 'pf_id', p_pf_id);
  END IF;
  IF v_pf_code NOT LIKE 'PF-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_pf', 'product_code', v_pf_code);
  END IF;

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

  UPDATE public.nomenclature SET
    kitchen_note     = COALESCE(p_payload->>'kitchen_note', kitchen_note),
    ttc_source_url   = COALESCE(p_payload->>'ttc_source_url', ttc_source_url),
    card_version     = v_new_version,
    last_verified_at = now(),
    last_verified_by = v_user_id
  WHERE id = p_pf_id;

  v_pc_payload := COALESCE(p_payload->'pf_pack_card', '{}'::jsonb);

  INSERT INTO public.pf_pack_card (
    nomenclature_id, batch_input_qty, batch_input_uom, portions_per_batch, portion_weight_g,
    vacuum_bag_size, fill_weight_per_bag_g, portions_per_bag, label_template,
    shelf_life_days, storage_zone, storage_temp_min_c, storage_temp_max_c, kitchen_photo_url
  ) VALUES (
    p_pf_id,
    NULLIF(v_pc_payload->>'batch_input_qty', '')::NUMERIC,
    v_pc_payload->>'batch_input_uom',
    NULLIF(v_pc_payload->>'portions_per_batch', '')::NUMERIC,
    NULLIF(v_pc_payload->>'portion_weight_g', '')::NUMERIC,
    v_pc_payload->>'vacuum_bag_size',
    NULLIF(v_pc_payload->>'fill_weight_per_bag_g', '')::NUMERIC,
    NULLIF(v_pc_payload->>'portions_per_bag', '')::NUMERIC,
    v_pc_payload->'label_template',
    NULLIF(v_pc_payload->>'shelf_life_days', '')::INT,
    v_pc_payload->>'storage_zone',
    NULLIF(v_pc_payload->>'storage_temp_min_c', '')::NUMERIC,
    NULLIF(v_pc_payload->>'storage_temp_max_c', '')::NUMERIC,
    v_pc_payload->>'kitchen_photo_url'
  )
  ON CONFLICT (nomenclature_id) DO UPDATE SET
    batch_input_qty       = COALESCE(EXCLUDED.batch_input_qty,       pf_pack_card.batch_input_qty),
    batch_input_uom       = COALESCE(EXCLUDED.batch_input_uom,       pf_pack_card.batch_input_uom),
    portions_per_batch    = COALESCE(EXCLUDED.portions_per_batch,    pf_pack_card.portions_per_batch),
    portion_weight_g      = COALESCE(EXCLUDED.portion_weight_g,      pf_pack_card.portion_weight_g),
    vacuum_bag_size       = COALESCE(EXCLUDED.vacuum_bag_size,       pf_pack_card.vacuum_bag_size),
    fill_weight_per_bag_g = COALESCE(EXCLUDED.fill_weight_per_bag_g, pf_pack_card.fill_weight_per_bag_g),
    portions_per_bag      = COALESCE(EXCLUDED.portions_per_bag,      pf_pack_card.portions_per_bag),
    label_template        = COALESCE(EXCLUDED.label_template,        pf_pack_card.label_template),
    shelf_life_days       = COALESCE(EXCLUDED.shelf_life_days,       pf_pack_card.shelf_life_days),
    storage_zone          = COALESCE(EXCLUDED.storage_zone,          pf_pack_card.storage_zone),
    storage_temp_min_c    = COALESCE(EXCLUDED.storage_temp_min_c,    pf_pack_card.storage_temp_min_c),
    storage_temp_max_c    = COALESCE(EXCLUDED.storage_temp_max_c,    pf_pack_card.storage_temp_max_c),
    kitchen_photo_url     = COALESCE(EXCLUDED.kitchen_photo_url,     pf_pack_card.kitchen_photo_url);

  RETURN jsonb_build_object('ok', true, 'new_version', v_new_version);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pf_pack_card_save(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_pf_pack_card_save(UUID, JSONB) IS
  'Atomic Save & Verify for a PF item: updates nomenclature.kitchen_note + upserts pf_pack_card + bumps card_version. Optimistic lock via payload.expected_version.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '186_rpc_pf_pack_card_save.sql',
  'claude-code',
  'fn_pf_pack_card_save RPC with optimistic locking + version bump.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
