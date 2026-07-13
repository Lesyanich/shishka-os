-- 350a_fn_thaw_batch_staff_uuid.sql
-- Corrective for 350: stock_transfers.transferred_by is a NULLABLE uuid
-- (staff.id), not text — the first live insert failed with a type error
-- (caught in the rolled-back prod demo before anything shipped). Recreate
-- fn_thaw_batch with p_by as uuid. DROP first: replacing with a different
-- param type would otherwise create an ambiguous overload for PostgREST.

DROP FUNCTION IF EXISTS public.fn_thaw_batch(text, text);

CREATE OR REPLACE FUNCTION public.fn_thaw_batch(
  p_barcode text,
  p_by      uuid DEFAULT NULL   -- staff.id of the person pulling the pack (optional)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_batch      record;
  v_freezer_id uuid;
  v_fridge_id  uuid;
  v_thaw_days  int;
  v_new_expiry timestamptz;
BEGIN
  IF p_barcode IS NULL OR btrim(p_barcode) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'barcode is required');
  END IF;

  SELECT id INTO v_freezer_id FROM public.locations WHERE name = 'Freezer';
  SELECT id INTO v_fridge_id  FROM public.locations WHERE name = 'Fridge';
  IF v_freezer_id IS NULL OR v_fridge_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Freezer/Fridge locations missing (mig 348 not applied)');
  END IF;

  SELECT b.id, b.nomenclature_id, b.barcode, b.batch_code, b.weight, b.location_id,
         b.expires_at, b.status,
         n.name, n.base_unit, n.thawed_shelf_life_days
    INTO v_batch
  FROM public.inventory_batches b
  JOIN public.nomenclature n ON n.id = b.nomenclature_id
  WHERE b.barcode = btrim(p_barcode);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', format('no batch with barcode %s', p_barcode));
  END IF;

  IF v_batch.status NOT IN ('sealed', 'produced') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('batch %s is %s — only sealed/produced batches can be thawed', v_batch.batch_code, v_batch.status));
  END IF;

  IF v_batch.location_id <> v_freezer_id THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('batch %s is not in the Freezer', v_batch.batch_code));
  END IF;

  v_thaw_days  := COALESCE(v_batch.thawed_shelf_life_days, 7);
  -- Thawing must never EXTEND a batch's life.
  v_new_expiry := LEAST(COALESCE(v_batch.expires_at, now() + make_interval(days => v_thaw_days)),
                        now() + make_interval(days => v_thaw_days));

  UPDATE public.inventory_batches
  SET location_id = v_fridge_id,
      expires_at  = v_new_expiry
  WHERE id = v_batch.id;

  INSERT INTO public.stock_transfers (batch_id, from_location, to_location, transferred_by)
  VALUES (v_batch.id, v_freezer_id, v_fridge_id, p_by);

  RETURN jsonb_build_object(
    'ok',           true,
    'batch_id',     v_batch.id,
    'barcode',      v_batch.barcode,
    'batch_code',   v_batch.batch_code,
    'name',         v_batch.name,
    'weight',       v_batch.weight,
    'base_unit',    v_batch.base_unit,
    'new_expires_at', v_new_expiry,
    'thawed_days',  v_thaw_days
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_thaw_batch(text, uuid) TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '350a_fn_thaw_batch_staff_uuid.sql',
  'claude-code',
  NULL,
  'Corrective: fn_thaw_batch p_by text -> uuid (stock_transfers.transferred_by is nullable uuid staff.id). DROP old signature to avoid ambiguous overload.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_thaw_batch(text, uuid);
