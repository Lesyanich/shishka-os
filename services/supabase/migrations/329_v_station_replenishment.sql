-- 329_v_station_replenishment.sql
-- W1 Connected Stock Model (spec §3.2 / §5 M4, CEO decisions §10-A/§10-D, MC c605e2ca).
--
-- Station-aware reorder/production view: extends the global v_stock_status (mig 320)
-- with the location dimension and the purchase-vs-produce verdict per station.
--
--   replenish_action = 'purchase'  for RAW (raw_ingredient) -> stock_requests -> PO
--                    = 'produce'    for PF/good             -> production_orders -> L1
--
-- This is the CEO's "a button on an inventoried item -> to-purchase OR to-prep-at-L1."
-- Hybrid par (§10-A): station_par override COALESCE'd over the global nomenclature par.
-- v1 runs on the 3 coarse warehouses already in `locations` (§10-D); sub-stations are a
-- zero-migration fast-follow (just more locations rows).
--
-- Candidate rows = every (nomenclature, location) that has a live batch OR a station_par
-- override. RAW naturally keys off Storage, PF off Kitchen/Assembly, because that is where
-- batches physically sit — no cartesian explosion.

CREATE OR REPLACE VIEW public.v_station_replenishment AS
WITH cand AS (
  SELECT nomenclature_id, location_id FROM public.v_stock_on_hand_by_location
  UNION
  SELECT nomenclature_id, location_id FROM public.station_par
)
SELECT
  n.id                                                AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS name,
  n.type,
  n.base_unit,
  c.location_id,
  l.name                                              AS location_name,
  l.type                                              AS location_type,
  COALESCE(oh.on_hand, 0)                             AS on_hand,
  COALESCE(oh.live_batches, 0)                        AS live_batches,
  oh.next_expiry,
  COALESCE(oh.expiring_soon, 0)                       AS expiring_soon,
  -- hybrid par: per-station override (station_par) falls back to global nomenclature par
  COALESCE(sp.min_stock,   n.min_stock)               AS min_stock,
  COALESCE(sp.par_stock,   n.par_stock)               AS par_stock,
  COALESCE(sp.reorder_qty, n.reorder_qty)             AS reorder_qty,
  (sp.nomenclature_id IS NOT NULL)                    AS par_is_station_override,
  -- suggested order/produce qty in base_unit
  CASE
    WHEN COALESCE(sp.min_stock, n.min_stock) IS NULL                       THEN NULL
    WHEN COALESCE(oh.on_hand, 0) > COALESCE(sp.min_stock, n.min_stock)     THEN 0
    ELSE COALESCE(
           COALESCE(sp.reorder_qty, n.reorder_qty),
           GREATEST(
             COALESCE(COALESCE(sp.par_stock, n.par_stock),
                      COALESCE(sp.min_stock, n.min_stock)) - COALESCE(oh.on_hand, 0),
             0)
         )
  END                                                 AS suggested_qty,
  CASE
    WHEN COALESCE(sp.min_stock, n.min_stock) IS NULL                       THEN 'untracked'
    WHEN COALESCE(oh.on_hand, 0) <= 0                                      THEN 'out'
    WHEN COALESCE(oh.on_hand, 0) <= COALESCE(sp.min_stock, n.min_stock)    THEN 'low'
    ELSE 'ok'
  END                                                 AS stock_status,
  CASE
    WHEN n.type = 'raw_ingredient' THEN 'purchase'
    ELSE 'produce'
  END                                                 AS replenish_action
FROM cand c
JOIN public.nomenclature n ON n.id = c.nomenclature_id
JOIN public.locations    l ON l.id = c.location_id
LEFT JOIN public.v_stock_on_hand_by_location oh
       ON oh.nomenclature_id = c.nomenclature_id AND oh.location_id = c.location_id
LEFT JOIN public.station_par sp
       ON sp.nomenclature_id = c.nomenclature_id AND sp.location_id = c.location_id
WHERE COALESCE(n.is_deleted, false) = false;

GRANT SELECT ON public.v_station_replenishment TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '329_v_station_replenishment.sql',
  'claude-code',
  NULL,
  'W1 (c605e2ca): v_station_replenishment — per-station on_hand vs hybrid par (station_par over global, §10-A) + stock_status + suggested_qty + replenish_action (RAW=purchase / PF=produce, §10-B button target).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP VIEW IF EXISTS public.v_station_replenishment;
