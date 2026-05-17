-- Migration 188: fn_loyverse_sync_dish — build Loyverse item payload
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Returns the Loyverse item JSON payload (does NOT push — push happens in admin-panel via the Loyverse REST client).
-- Customer-facing fields only: short name (fallback name), description + allergen suffix, photo, price.

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
  SELECT id, product_code, name, customer_short_name, customer_description, customer_photo_url, price
    INTO v_row
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;
  IF v_row.product_code NOT LIKE 'SALE-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_sale_dish', 'product_code', v_row.product_code);
  END IF;

  v_allergens := public.fn_dish_allergens(p_dish_id);

  -- Suffix only if allergens present (fn_dish_allergens already returns sorted)
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

GRANT EXECUTE ON FUNCTION public.fn_loyverse_sync_dish(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_loyverse_sync_dish(UUID) IS
  'Builds Loyverse item payload for a SALE dish (customer_short_name|name, customer_description + allergen suffix, customer_photo_url, price). Does not push.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '188_rpc_loyverse_sync_dish.sql',
  'claude-code',
  'fn_loyverse_sync_dish RPC — builds Loyverse item payload (push lives in admin-panel client).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
