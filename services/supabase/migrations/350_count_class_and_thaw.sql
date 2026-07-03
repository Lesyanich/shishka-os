-- 350_count_class_and_thaw.sql
-- Station stock v1 (S1). Two independent pieces:
--
-- A) ABC cycle-count classes (CEO 2026-07-03: "не считать соль каждый день,
--    но креветку — считать; неделя точно нет"). Restaurant-standard cycle
--    counting: every item gets a cadence class, the daily checklist pulls only
--    what is DUE today.
--      A = daily   (perishable OR expensive: proteins, preps, fresh greens)
--      B = weekly  (frozen, sauces, long dairy)
--      C = monthly (dry staples, spices)
--    count_class lives on nomenclature (cadence is a property of the item —
--    perishability/value — not of where it sits; per-station cadence override
--    is a v2 concern). Auto-heuristic below, overridable: setting
--    count_class_source='manual' pins the class against re-backfills.
--
-- B) Thaw grounding for the freezer->fridge process (shrimp model, CEO):
--    one SKU, two zone pools. fn_thaw_batch moves a batch Freezer -> Fridge,
--    re-clocks expiry with a hard CAP (thawing must never EXTEND life:
--    LEAST(frozen expiry, now() + thawed shelf life)), and logs the move in
--    the previously dormant stock_transfers table. Returns the batch payload
--    so the UI re-prints a 7-day use-by label (physical pack must match the
--    system clock).

-- ── A1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS count_class text
    CHECK (count_class IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS count_class_source text NOT NULL DEFAULT 'auto'
    CHECK (count_class_source IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS thawed_shelf_life_days int
    CHECK (thawed_shelf_life_days IS NULL OR thawed_shelf_life_days > 0);

COMMENT ON COLUMN public.nomenclature.count_class IS
  'ABC cycle-count cadence: A=daily, B=weekly, C=monthly. Drives is_due_today in v_station_checklist (mig 351).';
COMMENT ON COLUMN public.nomenclature.count_class_source IS
  'auto = re-backfillable by the heuristic; manual = pinned by the owner.';
COMMENT ON COLUMN public.nomenclature.thawed_shelf_life_days IS
  'Post-thaw fridge shelf life in days (e.g. 7 for vacuum sous-vide shrimp). Used by fn_thaw_batch to re-clock expires_at with a LEAST cap.';

-- ── A2. Idempotent auto-backfill (only rows still marked auto) ─────────────

UPDATE public.nomenclature n
SET count_class = CASE
      WHEN COALESCE(n.shelf_life_days, 999) <= 5
        OR COALESCE(n.cost_per_unit, 0) >= 500             THEN 'A'
      WHEN COALESCE(n.shelf_life_days, 999) >= 90
       AND COALESCE(n.cost_per_unit, 0) < 100              THEN 'C'
      ELSE 'B'
    END
WHERE n.count_class_source = 'auto'
  AND COALESCE(n.is_deleted, false) = false
  AND n.type IN ('raw_ingredient', 'semi_finished', 'good', 'modifier');

-- ── A3. Thawed shelf life seed: vacuum frozen shrimp preps = 7 days ────────
-- (CEO + prior session decision: frozen <=30d in freezer -> thawed 7d fridge.)

UPDATE public.nomenclature
SET thawed_shelf_life_days = 7
WHERE product_code IN ('PF-SHRIMP_MARINATED_FZ', 'PF-SHRIMP_SOUSVIDE')
  AND thawed_shelf_life_days IS NULL;

-- ── B. fn_thaw_batch ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_thaw_batch(
  p_barcode text,
  p_by      text DEFAULT NULL
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
  -- Thawing must never EXTEND a batch''s life.
  v_new_expiry := LEAST(COALESCE(v_batch.expires_at, now() + make_interval(days => v_thaw_days)),
                        now() + make_interval(days => v_thaw_days));

  UPDATE public.inventory_batches
  SET location_id = v_fridge_id,
      expires_at  = v_new_expiry
  WHERE id = v_batch.id;

  INSERT INTO public.stock_transfers (batch_id, from_location, to_location, transferred_by)
  VALUES (v_batch.id, v_freezer_id, v_fridge_id, COALESCE(p_by, 'unknown'));

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

GRANT EXECUTE ON FUNCTION public.fn_thaw_batch(text, text) TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '350_count_class_and_thaw.sql',
  'claude-code',
  NULL,
  'Station stock v1 S1: nomenclature.count_class A|B|C (+source auto|manual, heuristic backfill: A shelf<=5d or cost>=500; C shelf>=90d and cost<100; B rest) + thawed_shelf_life_days (7 for shrimp PF) + fn_thaw_batch(barcode): Freezer->Fridge, LEAST-capped re-clock, stock_transfers log (first real user), returns payload for 7-day re-label.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_thaw_batch(text, text);
-- ALTER TABLE public.nomenclature
--   DROP COLUMN IF EXISTS count_class,
--   DROP COLUMN IF EXISTS count_class_source,
--   DROP COLUMN IF EXISTS thawed_shelf_life_days;
