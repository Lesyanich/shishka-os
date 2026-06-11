-- Migration 264: track Loyverse price + allow re-push of synced dishes
-- ============================================================================
-- Two coupled bugs surfaced on /menu:
--   1. A dish whose price was edited after its last Loyverse push stays
--      pos_status='synced' AND the page shows no price mismatch — Loyverse keeps
--      the OLD price while the badge says "Synced". There was no stored Loyverse
--      price to compare against.
--   2. Clicking "Push" on such a dish returned HTTP 400 ("pos_status must be
--      approved"): fn_loyverse_sync_dish only accepted pos_status='approved', so
--      an already-synced dish could never be RE-pushed to fix the drift.
--
-- Fix:
--   * loyverse_price column = the price Loyverse currently holds (written by the
--     edge fn on every push/update and by the reconcile_prices sweep). Drift is
--     then exact: loyverse_price <> price.
--   * Gate now allows pos_status IN ('approved','synced') so a synced dish can be
--     re-pushed (the edge fn updates the existing item in place, preserving
--     modifiers/variants, rebasing only the price).
-- ============================================================================

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS loyverse_price numeric;

COMMENT ON COLUMN public.nomenclature.loyverse_price IS
  'Price Loyverse POS currently holds for this item, as of the last push/update or reconcile_prices sweep. Compare with price to detect drift (loyverse_price <> price). NULL = never pushed / unknown.';

-- Re-push gate: accept approved OR synced (was: approved only).
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

  IF v_row.pos_status NOT IN ('approved', 'synced') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_ready', 'reason', 'pos_status must be approved or synced', 'pos_status', v_row.pos_status);
  END IF;
  IF v_row.is_available IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_ready', 'reason', 'is_available must be true', 'is_available', v_row.is_available);
  END IF;

  v_allergens := public.fn_dish_allergens(p_dish_id);

  IF array_length(v_allergens, 1) IS NOT NULL THEN
    v_suffix := E'\n(contains: ' || array_to_string(v_allergens, ', ') || ')';
  ELSE
    v_suffix := '';
  END IF;

  v_desc := COALESCE(v_row.customer_description, '') || v_suffix;

  v_base_name := COALESCE(NULLIF(v_row.customer_short_name, ''), v_row.name);
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
$function$;

INSERT INTO public.migration_log (filename, applied_at, applied_by, status, notes)
VALUES (
  '264_loyverse_price_and_resync_gate.sql', NOW(), 'claude-code', 'success',
  'Add nomenclature.loyverse_price (POS-held price for drift detection); fn_loyverse_sync_dish gate now allows pos_status IN (approved,synced) so synced dishes can be re-pushed to fix price drift.'
);
