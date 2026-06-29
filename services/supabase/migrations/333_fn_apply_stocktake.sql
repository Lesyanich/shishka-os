-- 333_fn_apply_stocktake.sql
-- W1 Connected Stock Model (spec §4 / §4.1, CEO decision §10-C, MC c605e2ca).
--
-- The single unified count sink for BOTH the Telegram bot AND the admin Stocktake UI.
-- A physical count is an assertion of truth; we honour it WITHOUT spawning a second
-- global number (no split-brain — CEO §10-C):
--   1. Append the count to stocktake_entries (immutable audit log: who/when/station/raw).
--   2. Compare it to the batch-derived on-hand at that station (v_stock_on_hand_by_location).
--   3. Post ONE reconciling stock_movements row (reason='stocktake_adj', location-scoped)
--      carrying the delta — the auditable record of the discrepancy (spec §4.1 option #1).
-- Actual batch open/close reconciliation of the physical truth is a deferred follow-up.
--
-- Station<->location map (stocktake_entries.station CHECK is 'L1'|'L2'|'general'):
--   L1 -> Kitchen (kitchen) · L2 -> Assembly (assembly) · general -> Storage (storage).
-- Accepts EITHER p_location_id (admin, preferred) OR p_station (bot compat); resolves
-- whichever is given. SECURITY DEFINER so the bot (service role) and admin (authenticated)
-- both write through the same audited path.

CREATE OR REPLACE FUNCTION public.fn_apply_stocktake(
  p_nomenclature_id uuid,
  p_counted_qty     numeric,
  p_location_id     uuid    DEFAULT NULL,
  p_station         text    DEFAULT NULL,   -- 'L1'|'L2'|'general' (used when p_location_id is NULL)
  p_unit            text    DEFAULT NULL,   -- must equal nomenclature.base_unit when provided
  p_counted_by      text    DEFAULT NULL,
  p_source          text    DEFAULT 'admin',-- 'bot' | 'admin'
  p_source_text     text    DEFAULT NULL,
  p_session_id      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_base_unit   text;
  v_location_id uuid;
  v_loc_type    text;
  v_station     text;
  v_on_hand     numeric;
  v_delta       numeric;
  v_entry_id    uuid;
BEGIN
  -- ── 1. Validate inputs ──
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'counted_qty must be >= 0');
  END IF;

  SELECT base_unit INTO v_base_unit
  FROM public.nomenclature WHERE id = p_nomenclature_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown nomenclature_id');
  END IF;

  -- Unit integrity (spec §8): a count in the wrong unit silently corrupts on-hand.
  IF p_unit IS NOT NULL AND v_base_unit IS NOT NULL AND p_unit <> v_base_unit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('unit mismatch: counted in %s but base_unit is %s', p_unit, v_base_unit));
  END IF;

  -- ── 2. Resolve location (prefer explicit id; else map bot station code) ──
  IF p_location_id IS NOT NULL THEN
    SELECT id, type::text INTO v_location_id, v_loc_type
    FROM public.locations WHERE id = p_location_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'unknown location_id');
    END IF;
  ELSIF p_station IS NOT NULL THEN
    v_loc_type := CASE upper(p_station)
                    WHEN 'L1' THEN 'kitchen'
                    WHEN 'L2' THEN 'assembly'
                    ELSE 'storage'         -- 'general' / anything else
                  END;
    SELECT id INTO v_location_id
    FROM public.locations WHERE type::text = v_loc_type ORDER BY name LIMIT 1;
    IF v_location_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('no location of type %s for station %s', v_loc_type, p_station));
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'one of p_location_id or p_station is required');
  END IF;

  -- station code stored on the audit row (CHECK 'L1'|'L2'|'general')
  v_station := CASE v_loc_type
                 WHEN 'kitchen'  THEN 'L1'
                 WHEN 'assembly' THEN 'L2'
                 ELSE 'general'
               END;

  -- ── 3. Append to the audit log (stocktake_entries) ──
  INSERT INTO public.stocktake_entries (
    nomenclature_id, station, counted_qty, unit, counted_by, source_text, status, session_id
  ) VALUES (
    p_nomenclature_id, v_station, p_counted_qty, v_base_unit, p_counted_by, p_source_text,
    'confirmed', p_session_id
  )
  RETURNING id INTO v_entry_id;

  -- ── 4. Batch-derived on-hand at this station, then the reconciling adjustment ──
  SELECT COALESCE(SUM(weight), 0) INTO v_on_hand
  FROM public.inventory_batches
  WHERE nomenclature_id = p_nomenclature_id
    AND location_id     = v_location_id
    AND status IN ('sealed', 'opened', 'produced');

  v_delta := p_counted_qty - v_on_hand;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements (nomenclature_id, qty_delta, reason, location_id, notes)
    VALUES (
      p_nomenclature_id,
      v_delta,
      'stocktake_adj',
      v_location_id,
      format('stocktake by %s (source=%s): counted %s vs batch on-hand %s at %s',
             COALESCE(p_counted_by, 'unknown'), COALESCE(p_source, 'admin'),
             p_counted_qty, v_on_hand, v_station)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',               true,
    'entry_id',         v_entry_id,
    'nomenclature_id',  p_nomenclature_id,
    'location_id',      v_location_id,
    'station',          v_station,
    'on_hand_before',   v_on_hand,
    'counted',          p_counted_qty,
    'adjustment_delta', v_delta,
    'source',           COALESCE(p_source, 'admin')
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_apply_stocktake(
  uuid, numeric, uuid, text, text, text, text, text, uuid
) TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '333_fn_apply_stocktake.sql',
  'claude-code',
  NULL,
  'W1 (c605e2ca): fn_apply_stocktake — unified count sink for bot AND admin; appends stocktake_entries audit + posts one location-scoped stocktake_adj stock_movements row (spec §4.1). Unit-integrity guard, L1/L2/general<->location map. SECURITY DEFINER.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_apply_stocktake(uuid, numeric, uuid, text, text, text, text, text, uuid);
