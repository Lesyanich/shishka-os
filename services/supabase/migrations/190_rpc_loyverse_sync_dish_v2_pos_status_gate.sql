-- Migration 190: fn_loyverse_sync_dish v2 — gate by pos_status + is_available
-- Source: MC 7bc42a08 (companion to mig 189 pos_status)
--
-- v1 (mig 188) returned payload for any SALE-* dish.
-- v2 returns `not_ready` error if pos_status <> 'approved' OR is_available = false.
-- This is the safety gate before any Loyverse push action.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_loyverse_sync_dish(p_dish_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_row       RECORD;
  v_allergens TEXT[];
  v_desc      TEXT;
  v_suffix    TEXT;
BEGIN
  SELECT id, product_code, name, customer_short_name, customer_description, customer_photo_url, price,
         pos_status, is_available
    INTO v_row
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;
  IF v_row.product_code NOT LIKE 'SALE-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_sale_dish', 'product_code', v_row.product_code);
  END IF;

  -- Readiness gate (added in v2)
  IF v_row.pos_status <> 'approved' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_ready',
      'reason', 'pos_status must be approved',
      'pos_status', v_row.pos_status
    );
  END IF;
  IF v_row.is_available IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_ready',
      'reason', 'is_available must be true',
      'is_available', v_row.is_available
    );
  END IF;

  v_allergens := public.fn_dish_allergens(p_dish_id);

  IF array_length(v_allergens, 1) IS NOT NULL THEN
    v_suffix := E'\n(contains: ' || array_to_string(v_allergens, ', ') || ')';
  ELSE
    v_suffix := '';
  END IF;

  v_desc := COALESCE(v_row.customer_description, '') || v_suffix;

  RETURN jsonb_build_object(
    'ok', true,
    'payload', jsonb_build_object(
      'name',          COALESCE(NULLIF(v_row.customer_short_name, ''), v_row.name),
      'description',   v_desc,
      'image_url',     v_row.customer_photo_url,
      'default_price', v_row.price
    )
  );
END;
$$;

COMMENT ON FUNCTION public.fn_loyverse_sync_dish(UUID) IS
  'v2: Builds Loyverse item payload for SALE dish, gated by pos_status=approved AND is_available=true. Returns ok+payload or not_ready+reason.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '190_rpc_loyverse_sync_dish_v2_pos_status_gate.sql',
  'claude-code',
  'fn_loyverse_sync_dish v2 — gates by pos_status=approved + is_available=true (MC 7bc42a08).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
