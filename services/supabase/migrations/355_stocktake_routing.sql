-- 355_stocktake_routing.sql
-- Station stock v1 (S3). Closes the count -> action loop: a REVIEWED (applied)
-- stocktake session's low lines become concrete work —
--   RAW-low -> Shopping List (buy it)
--   PF-low  -> Production task at the PRODUCING station (make it)
-- MC 563af492 (initiative 8b709aa0). Builds on migs 348-354.
--
-- Two pieces + provenance:
--
-- 1. v_stocktake_session_lines — ONE read model for both the review table
--    (counted vs batch on-hand, Δ, Δ×cost ฿) AND the two routing tick-lists
--    (is_raw/is_pf, is_low, suggested_qty, producing station). Sourced from the
--    session's OWN counted lines (stocktake_entries pending OR confirmed), NOT
--    v_stock_status: apply() deliberately does NOT rewrite batch weights (mig
--    352), so batch-derived on-hand is stale after a count — the physical truth
--    is the counted number. RAW vs PF split by product_code prefix (RAW-/PF-),
--    NOT by type ('good' is legacy-RAW-ambiguous). "low" + "suggested" mirror
--    v_stock_status (mig 320) semantics with on_hand := the counted qty.
--
-- 2. fn_route_stocktake_session(session, shopping_ids[], production_ids[]) —
--    inserts ONLY the ticked ids. owner/task_manager gated (mig 313 pattern:
--    staff.app_role IN ('owner','task_manager')). Shopping insert is idempotent
--    on an open line (mig 321 pattern: skip if a needed/ordered line already
--    exists), source 'stocktake'. Production insert -> production_tasks at the
--    producing station. Ticked items it can't place (open shopping line already
--    there / no producing station) are returned in `skipped`, not silently
--    dropped. Requires the session to be 'applied' (route the confirmed truth,
--    not a draft).
--
-- 3. provenance columns: shopping_list_items.stocktake_session_id;
--    production_tasks.stocktake_session_id + station_id (all nullable).
--
-- CAVEATS (v1):
--  * fn_create_batches_from_task STILL hardcodes the Kitchen location, so when
--    staff COMPLETE a routed production task its output batch lands at Kitchen
--    regardless of station_id. station_id here is routing metadata (who should
--    make it); correct batch placement is epic 8b709aa0 W3 — do NOT fix here.
--  * The 16 frozen PF-MANAISH_*_FROZEN carry a NULL category (frozen-PF category
--    tidy deferred), so they map to no producing station — routing skips them
--    with reason 'no producing station mapped' for manual handling.

-- ── 1. provenance columns ──────────────────────────────────────────────────

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS stocktake_session_id uuid
    REFERENCES public.stocktake_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.production_tasks
  ADD COLUMN IF NOT EXISTS stocktake_session_id uuid
    REFERENCES public.stocktake_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS station_id uuid
    REFERENCES public.stations(id);

COMMENT ON COLUMN public.production_tasks.station_id IS
  'Producing station (stations.id) this replenishment task is routed to (S3). Routing metadata only — fn_create_batches_from_task still lands output at Kitchen until epic W3.';

-- ── 2. read model: per-session lines (review table + routing candidates) ────

CREATE OR REPLACE VIEW public.v_stocktake_session_lines AS
WITH latest AS (
  -- one line per (session, item): pending before apply, confirmed after
  SELECT DISTINCT ON (e.session_id, e.nomenclature_id)
    e.session_id, e.nomenclature_id, e.counted_qty
  FROM public.stocktake_entries e
  WHERE e.status IN ('pending', 'confirmed')
  ORDER BY e.session_id, e.nomenclature_id,
           (e.status = 'confirmed') DESC, e.created_at DESC
)
SELECT
  s.id                                                 AS session_id,
  s.station_id,
  s.location_id,
  n.id                                                 AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name)  AS name,
  n.base_unit,
  n.type,
  n.cost_per_unit,
  CASE WHEN pc.code LIKE 'NF-PKG%' THEN 'packaging' ELSE 'food' END AS item_kind,
  (n.product_code LIKE 'RAW-%')                        AS is_raw,
  (n.product_code LIKE 'PF-%')                         AS is_pf,
  l.counted_qty                                        AS counted,
  COALESCE(oh.on_hand, 0)                              AS on_hand,
  (l.counted_qty - COALESCE(oh.on_hand, 0))            AS delta,
  round((l.counted_qty - COALESCE(oh.on_hand, 0)) * COALESCE(n.cost_per_unit, 0)) AS delta_thb,
  COALESCE(sp.min_stock, n.min_stock)                  AS min_stock,
  COALESCE(sp.par_stock, n.par_stock)                  AS par_stock,
  -- reorder trigger: counted at/under min (mig 320 'low'/'out', on_hand:=counted)
  (COALESCE(sp.min_stock, n.min_stock) IS NOT NULL
     AND l.counted_qty <= COALESCE(sp.min_stock, n.min_stock)) AS is_low,
  -- fill-to-par suggestion (mig 320 formula), NULL when no par line set
  CASE
    WHEN COALESCE(sp.min_stock, n.min_stock) IS NULL              THEN NULL
    WHEN l.counted_qty > COALESCE(sp.min_stock, n.min_stock)      THEN 0
    ELSE GREATEST(COALESCE(sp.par_stock, n.par_stock,
                           sp.min_stock, n.min_stock) - l.counted_qty, 0)
  END                                                  AS suggested_qty,
  ps.station_id                                        AS producing_station_id,
  ps.station_code                                      AS producing_station_code,
  ps.station_name                                      AS producing_station_name
FROM latest l
JOIN public.stocktake_sessions s ON s.id = l.session_id
JOIN public.nomenclature n ON n.id = l.nomenclature_id
LEFT JOIN public.product_categories pc ON pc.id = n.category_id
LEFT JOIN public.v_stock_on_hand_by_location oh
       ON oh.nomenclature_id = n.id AND oh.location_id = s.location_id
LEFT JOIN public.station_par sp
       ON sp.nomenclature_id = n.id AND sp.location_id = s.location_id
LEFT JOIN LATERAL (
  -- the station that MAKES this item's category (deterministic pick)
  SELECT st.id AS station_id, st.code AS station_code, st.name AS station_name
  FROM public.station_categories sc
  JOIN public.stations st ON st.id = sc.station_id AND st.is_active
  WHERE sc.role = 'produces' AND sc.category_id = n.category_id
  ORDER BY st.sort_order
  LIMIT 1
) ps ON true;

GRANT SELECT ON public.v_stocktake_session_lines TO authenticated;

-- ── 3. route the ticked low lines to Shopping List / Production ─────────────

CREATE OR REPLACE FUNCTION public.fn_route_stocktake_session(
  p_session_id     uuid,
  p_shopping_ids   uuid[] DEFAULT '{}',
  p_production_ids uuid[] DEFAULT '{}',
  p_by             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_status  text;
  v_doc     text;
  v_line    record;
  v_qty     numeric;
  v_shop    int := 0;
  v_prod    int := 0;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  -- owner / task_manager gate (mig 313 pattern)
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid()
      AND s.app_role IN ('owner', 'task_manager')
      AND s.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden: owner or task_manager only');
  END IF;

  SELECT status, doc_number INTO v_status, v_doc
  FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown session');
  END IF;
  IF v_status <> 'applied' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('session is %s — apply the count before routing', v_status));
  END IF;

  -- ── RAW-low -> Shopping List (idempotent on open line, mig 321 pattern) ──
  FOR v_line IN
    SELECT * FROM public.v_stocktake_session_lines
    WHERE session_id = p_session_id AND nomenclature_id = ANY (p_shopping_ids)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.shopping_list_items sli
      WHERE sli.nomenclature_id = v_line.nomenclature_id
        AND sli.status IN ('needed', 'ordered')
    ) THEN
      v_skipped := v_skipped || jsonb_build_object(
        'nomenclature_id', v_line.nomenclature_id, 'name', v_line.name,
        'reason', 'open shopping line already exists');
      CONTINUE;
    END IF;

    v_qty := COALESCE(NULLIF(v_line.suggested_qty, 0), 1);
    INSERT INTO public.shopping_list_items
      (name, store, qty, unit, est_price, status, source,
       nomenclature_id, stocktake_session_id)
    VALUES (v_line.name, 'makro', v_qty, v_line.base_unit,
            round(v_qty * COALESCE(v_line.cost_per_unit, 0))::numeric,
            'needed', 'stocktake', v_line.nomenclature_id, p_session_id);
    v_shop := v_shop + 1;
  END LOOP;

  -- ── PF-low -> Production task at the producing station ───────────────────
  FOR v_line IN
    SELECT * FROM public.v_stocktake_session_lines
    WHERE session_id = p_session_id AND nomenclature_id = ANY (p_production_ids)
  LOOP
    IF v_line.producing_station_id IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'nomenclature_id', v_line.nomenclature_id, 'name', v_line.name,
        'reason', 'no producing station mapped');
      CONTINUE;
    END IF;

    v_qty := COALESCE(NULLIF(v_line.suggested_qty, 0), 1);
    INSERT INTO public.production_tasks
      (target_nomenclature_id, target_quantity, description, status,
       task_category, expected_duration_min, station_id, stocktake_session_id)
    VALUES (v_line.nomenclature_id, v_qty,
            format('Replenish %s — %s (stocktake)', v_line.name, v_doc),
            'pending', 'production', 30,
            v_line.producing_station_id, p_session_id);
    v_prod := v_prod + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'shopping_inserted', v_shop,
    'production_inserted', v_prod, 'skipped', v_skipped);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_route_stocktake_session(uuid, uuid[], uuid[], text) TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '355_stocktake_routing.sql',
  'claude-code',
  NULL,
  'Station stock v1 S3: v_stocktake_session_lines (review table + routing candidates from a session''s own counted lines; RAW/PF by prefix; low+suggested per mig 320) + fn_route_stocktake_session(session, shopping_ids[], production_ids[]) owner/task_manager-gated, applied-only, idempotent shopping (source stocktake), PF->production_tasks at producing station; skips unroutables. Provenance: shopping_list_items.stocktake_session_id, production_tasks.stocktake_session_id + station_id. MC 563af492.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_route_stocktake_session(uuid, uuid[], uuid[], text);
-- DROP VIEW IF EXISTS public.v_stocktake_session_lines;
-- ALTER TABLE public.production_tasks DROP COLUMN IF EXISTS station_id;
-- ALTER TABLE public.production_tasks DROP COLUMN IF EXISTS stocktake_session_id;
-- ALTER TABLE public.shopping_list_items DROP COLUMN IF EXISTS stocktake_session_id;
