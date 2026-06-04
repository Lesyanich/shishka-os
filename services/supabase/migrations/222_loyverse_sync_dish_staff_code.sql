-- Migration 222: fn_loyverse_sync_dish v3 — prepend staff_code to POS name
--
-- Companion to mig 221 (staff codes). The Loyverse item name now carries the
-- staff code as a prefix so the cashier sees "S-1 Mango Smoothie" on the tile
-- (and it prints on the customer receipt — normal for food service).
--
-- v2 (mig 190) built name as COALESCE(NULLIF(customer_short_name,''), name).
-- v3 wraps that base with: staff_code || ' ' || base  when staff_code is set.

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
  v_base_name TEXT;
  v_pos_name  TEXT;
BEGIN
  SELECT id, product_code, name, staff_code, customer_short_name, customer_description,
         customer_photo_url, price, pos_status, is_available
    INTO v_row
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;
  IF v_row.product_code NOT LIKE 'SALE-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_sale_dish', 'product_code', v_row.product_code);
  END IF;

  -- Readiness gate (from v2)
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

  -- Base label: short name if present, else internal name.
  v_base_name := COALESCE(NULLIF(v_row.customer_short_name, ''), v_row.name);
  -- Prepend staff code (v3) for POS tile + receipt identification.
  IF v_row.staff_code IS NOT NULL AND v_row.staff_code <> '' THEN
    v_pos_name := v_row.staff_code || ' ' || v_base_name;
  ELSE
    v_pos_name := v_base_name;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'payload', jsonb_build_object(
      'name',          v_pos_name,
      'description',   v_desc,
      'image_url',     v_row.customer_photo_url,
      'default_price', v_row.price
    )
  );
END;
$$;

COMMENT ON FUNCTION public.fn_loyverse_sync_dish(UUID) IS
  'v3: Builds Loyverse item payload for SALE dish. Prepends staff_code to the item name (e.g. "S-1 …"). Gated by pos_status=approved AND is_available=true.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '222_loyverse_sync_dish_staff_code.sql',
  'claude-code',
  'fn_loyverse_sync_dish v3 — prepends staff_code to Loyverse item name (companion to mig 221).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
