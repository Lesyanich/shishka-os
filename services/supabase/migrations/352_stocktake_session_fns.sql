-- 352_stocktake_session_fns.sql
-- Station stock v1 (S2). The stocktake session lifecycle functions that make
-- the document editable: open -> record counted lines -> submit -> apply.
--
-- DELIBERATELY SELF-CONTAINED: these do NOT call/alter fn_apply_stocktake
-- (mig 333, which the Telegram bot + ZeroDayStocktake use). That function
-- lives on epic c605e2ca's surface; touching it risks collision and it also
-- never stamps stocktake_entries.location_id (added in mig 349). So the
-- session apply writes its own confirmed entries (with location_id + floor)
-- and posts its own location-scoped stocktake_adj movements. One extra code
-- path, zero epic entanglement. When the epic unifies the write path, this
-- collapses back into it.
--
-- A count is an assertion of physical truth; we honour it by recording the
-- number + the discrepancy vs batch-derived on-hand as an auditable movement.
-- We do NOT rewrite batch weights here (batch reconciliation is deferred to
-- the epic) — so the checklist keeps showing batch_on_hand (theoretical) AND
-- last_count (actual), which is exactly the two-number model.

-- ── doc number: ST-YYYYMMDD-NN (ICT), per-day sequence ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_next_stocktake_doc_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day text := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD');
  v_seq int;
BEGIN
  SELECT count(*) + 1 INTO v_seq
  FROM public.stocktake_sessions
  WHERE doc_number LIKE 'ST-' || v_day || '-%';
  RETURN 'ST-' || v_day || '-' || lpad(v_seq::text, 2, '0');
END $$;

-- ── open (or resume the existing open draft) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_open_stocktake_session(
  p_station_code text,
  p_counted_by   text DEFAULT NULL,
  p_is_baseline  boolean DEFAULT false,
  p_scope        text DEFAULT 'food'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_station record;
  v_existing public.stocktake_sessions%ROWTYPE;
  v_id uuid;
  v_doc text;
BEGIN
  SELECT id, location_id, is_active INTO v_station
  FROM public.stations WHERE code = p_station_code;
  IF NOT FOUND OR NOT v_station.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', format('unknown/inactive station %s', p_station_code));
  END IF;

  -- resume an already-open document for this station+scope (one active only)
  SELECT * INTO v_existing
  FROM public.stocktake_sessions
  WHERE station_id = v_station.id AND scope = p_scope
    AND status IN ('draft', 'submitted')
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'resumed', true,
      'session_id', v_existing.id, 'doc_number', v_existing.doc_number,
      'status', v_existing.status, 'is_baseline', v_existing.is_baseline);
  END IF;

  v_doc := public.fn_next_stocktake_doc_number();
  INSERT INTO public.stocktake_sessions
    (doc_number, station_id, location_id, status, is_baseline, scope, counted_by)
  VALUES (v_doc, v_station.id, v_station.location_id, 'draft', p_is_baseline, p_scope, p_counted_by)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'resumed', false,
    'session_id', v_id, 'doc_number', v_doc, 'status', 'draft', 'is_baseline', p_is_baseline);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ── record / upsert one counted line (draft only) ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_record_stocktake_line(
  p_session_id      uuid,
  p_nomenclature_id uuid,
  p_counted_qty     numeric,
  p_counted_by      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sess record;
  v_floor text;
  v_unit text;
BEGIN
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'counted_qty must be >= 0');
  END IF;

  SELECT s.id, s.status, s.location_id, st.floor
    INTO v_sess
  FROM public.stocktake_sessions s
  JOIN public.stations st ON st.id = s.station_id
  WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown session');
  END IF;
  IF v_sess.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', format('session is %s — only draft accepts counts', v_sess.status));
  END IF;

  SELECT base_unit INTO v_unit FROM public.nomenclature WHERE id = p_nomenclature_id;

  INSERT INTO public.stocktake_entries
    (nomenclature_id, station, counted_qty, unit, counted_by, status, session_id, location_id)
  VALUES
    (p_nomenclature_id, v_sess.floor, p_counted_qty, v_unit, p_counted_by, 'pending', p_session_id, v_sess.location_id)
  ON CONFLICT (session_id, nomenclature_id) WHERE (status = 'pending')
  DO UPDATE SET counted_qty = EXCLUDED.counted_qty,
                counted_by  = COALESCE(EXCLUDED.counted_by, public.stocktake_entries.counted_by),
                created_at  = now();

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ── remove one draft line (staff cleared the field) ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_delete_stocktake_line(
  p_session_id uuid,
  p_nomenclature_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.stocktake_entries
  WHERE session_id = p_session_id AND nomenclature_id = p_nomenclature_id AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── submit (draft -> submitted) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_submit_stocktake_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown session'); END IF;
  IF v_status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', format('cannot submit a %s session', v_status));
  END IF;
  UPDATE public.stocktake_sessions
  SET status = 'submitted', submitted_at = now()
  WHERE id = p_session_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── cancel (abandon a draft/submitted document) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cancel_stocktake_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.stocktake_entries WHERE session_id = p_session_id AND status = 'pending';
  UPDATE public.stocktake_sessions
  SET status = 'cancelled'
  WHERE id = p_session_id AND status IN ('draft', 'submitted');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── apply (submitted|draft -> applied): confirm counts, post variance ───────
CREATE OR REPLACE FUNCTION public.fn_apply_stocktake_session(
  p_session_id uuid,
  p_applied_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sess     record;
  v_floor    text;
  v_line     record;
  v_on_hand  numeric;
  v_delta    numeric;
  v_cost     numeric;
  v_count    int := 0;
  v_variance numeric := 0;
  v_lines    jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_sess FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown session'); END IF;
  IF v_sess.status NOT IN ('draft', 'submitted') THEN
    RETURN jsonb_build_object('ok', false, 'error', format('session already %s', v_sess.status));
  END IF;

  SELECT floor INTO v_floor FROM public.stations WHERE id = v_sess.station_id;

  FOR v_line IN
    SELECT e.nomenclature_id, e.counted_qty, e.unit, n.cost_per_unit,
           COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS name
    FROM public.stocktake_entries e
    JOIN public.nomenclature n ON n.id = e.nomenclature_id
    WHERE e.session_id = p_session_id AND e.status = 'pending'
  LOOP
    -- batch-derived on-hand at this station's anchor
    SELECT COALESCE(SUM(weight), 0) INTO v_on_hand
    FROM public.inventory_batches
    WHERE nomenclature_id = v_line.nomenclature_id
      AND location_id = v_sess.location_id
      AND status IN ('sealed', 'opened', 'produced');

    v_delta := v_line.counted_qty - v_on_hand;
    v_cost  := COALESCE(v_line.cost_per_unit, 0);

    -- canonical confirmed entry (carries location_id for v_stock_latest_by_location)
    INSERT INTO public.stocktake_entries
      (nomenclature_id, station, counted_qty, unit, counted_by, status, session_id, location_id)
    VALUES
      (v_line.nomenclature_id, v_floor,
       v_line.counted_qty, v_line.unit, COALESCE(p_applied_by, v_sess.counted_by),
       'confirmed', p_session_id, v_sess.location_id);

    -- discrepancy movement (skip on baseline: first count is the starting truth)
    IF NOT v_sess.is_baseline AND v_delta <> 0 THEN
      INSERT INTO public.stock_movements (nomenclature_id, qty_delta, reason, location_id, notes)
      VALUES (v_line.nomenclature_id, v_delta, 'stocktake_adj', v_sess.location_id,
              format('stocktake %s: counted %s vs batch on-hand %s', v_sess.doc_number, v_line.counted_qty, v_on_hand));
    END IF;

    v_count := v_count + 1;
    v_variance := v_variance + (v_delta * v_cost);
    v_lines := v_lines || jsonb_build_object(
      'nomenclature_id', v_line.nomenclature_id, 'name', v_line.name,
      'counted', v_line.counted_qty, 'on_hand', v_on_hand,
      'delta', v_delta, 'delta_thb', round(v_delta * v_cost));
  END LOOP;

  -- drop the staging rows the confirmed entries superseded
  DELETE FROM public.stocktake_entries WHERE session_id = p_session_id AND status = 'pending';

  UPDATE public.stocktake_sessions
  SET status = 'applied', applied_at = now(), applied_by = p_applied_by,
      entries_count = v_count, variance_value_thb = round(v_variance),
      summary = jsonb_build_object('lines', v_lines)
  WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'entries_count', v_count,
    'variance_value_thb', round(v_variance), 'lines', v_lines);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_next_stocktake_doc_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_open_stocktake_session(text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_stocktake_line(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_stocktake_line(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_stocktake_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cancel_stocktake_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_stocktake_session(uuid, text) TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '352_stocktake_session_fns.sql',
  'claude-code',
  NULL,
  'Station stock v1 S2: stocktake session lifecycle fns (open/record/delete-line/submit/cancel/apply). Self-contained — does NOT touch fn_apply_stocktake (epic c605e2ca surface). Apply writes confirmed entries with location_id + posts location-scoped stocktake_adj movements (baseline skips variance), stamps session totals/summary. doc_number ST-YYYYMMDD-NN (ICT).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_apply_stocktake_session(uuid, text);
-- DROP FUNCTION IF EXISTS public.fn_cancel_stocktake_session(uuid);
-- DROP FUNCTION IF EXISTS public.fn_submit_stocktake_session(uuid);
-- DROP FUNCTION IF EXISTS public.fn_delete_stocktake_line(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.fn_record_stocktake_line(uuid, uuid, numeric, text);
-- DROP FUNCTION IF EXISTS public.fn_open_stocktake_session(text, text, boolean, text);
-- DROP FUNCTION IF EXISTS public.fn_next_stocktake_doc_number();
