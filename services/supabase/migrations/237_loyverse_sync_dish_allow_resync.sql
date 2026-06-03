-- Allow re-pushing an already-synced dish to Loyverse.
--
-- v2 gated push on pos_status = 'approved' exactly, which blocked re-syncing a
-- dish after it was edited (pos_status becomes 'synced' on first push). The
-- /menu drift control (loyverse_synced_at vs updated_at) needs a re-push path,
-- so the readiness gate now accepts 'approved' OR 'synced'. The Loyverse upsert
-- is idempotent (keyed by loyverse_item_id), so re-pushing just refreshes the
-- POS copy. 'draft' is still blocked. is_available gate unchanged.

CREATE OR REPLACE FUNCTION public.fn_loyverse_sync_dish(p_dish_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
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

  -- Readiness gate (v3): approved OR synced (allow re-push of edited dishes)
  IF v_row.pos_status NOT IN ('approved', 'synced') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_ready',
      'reason', 'pos_status must be approved or synced',
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
$function$;

COMMENT ON FUNCTION public.fn_loyverse_sync_dish(uuid) IS
  'v3: Builds Loyverse item payload for a SALE dish, gated by pos_status IN (approved, synced) AND is_available=true. Returns ok+payload or not_ready+reason.';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('237_loyverse_sync_dish_allow_resync.sql', 'Relax push gate to allow re-syncing already-synced dishes (drift re-push)', NULL)
ON CONFLICT (filename) DO NOTHING;
