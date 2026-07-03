-- 351_v_station_checklist.sql
-- Station stock v1 (S1). The auto-derived count checklist:
--   station -> consumed categories (station_categories role='consumes')
--           -> items in those categories (dishes for L2 sections, preps for L1)
--           -> full BOM descent (cycle-guarded) + dish modifier lines (MODs
--              consume stock too) + station_extra_items escape hatch
--           -> countable leaf components, food vs packaging split.
--
-- CEO rule: no hand-maintained lists — recipes change, lists must follow BOM.
-- Combine/split of stations = station_categories row edits; this view follows.
--
-- Plain view, NO materialization: BOM depth <= 4, bom_structures is a few
-- hundred rows, per-station candidate sets < 1k — Postgres resolves in ms.
--
-- Countable = raw_ingredient | semi_finished | good, plus LEAF modifiers
-- (a MOD with no BOM of its own is the physical item itself, e.g. whey
-- protein sachets; a MOD with BOM resolves to its RAW leaves instead).
-- SALE dishes themselves are never counted (they are made to order).
--
-- is_due_today implements ABC cycle counting (mig 350): an item is due when
-- it has never been counted at this station, or its last confirmed count at
-- this station is older than its class interval (A=1d, B=7d, C=30d).

CREATE OR REPLACE VIEW public.v_station_checklist AS
WITH RECURSIVE mapped_items AS (
  -- items sitting directly in a consumed category (SALE dishes for L2
  -- sections; PF preps for L1 process stations)
  SELECT sc.station_id, n.id AS nomenclature_id
  FROM public.station_categories sc
  JOIN public.nomenclature n ON n.category_id = sc.category_id
  WHERE sc.role = 'consumes'
    AND COALESCE(n.is_deleted, false) = false
    AND n.name NOT LIKE '[ARCHIVED]%'
    AND n.name NOT LIKE '[REPLACED]%'
),
modifier_items AS (
  -- MOD lines attached to mapped dishes consume stock at the station too
  SELECT DISTINCT mi.station_id, mo.modifier_id AS nomenclature_id
  FROM mapped_items mi
  JOIN public.nomenclature_modifier_options mo ON mo.dish_id = mi.nomenclature_id
  WHERE mo.modifier_id IS NOT NULL
),
roots AS (
  SELECT station_id, nomenclature_id FROM mapped_items
  UNION
  SELECT station_id, nomenclature_id FROM modifier_items
),
bom_walk AS (
  -- descend to every component; path array guards against cycles
  SELECT r.station_id, b.ingredient_id AS nomenclature_id,
         ARRAY[r.nomenclature_id, b.ingredient_id] AS path, 1 AS depth
  FROM roots r
  JOIN public.bom_structures b ON b.parent_id = r.nomenclature_id
  UNION
  SELECT w.station_id, b.ingredient_id, w.path || b.ingredient_id, w.depth + 1
  FROM bom_walk w
  JOIN public.bom_structures b ON b.parent_id = w.nomenclature_id
  WHERE w.depth < 6 AND NOT b.ingredient_id = ANY (w.path)
),
candidates AS (
  SELECT station_id, nomenclature_id FROM roots        -- mapped preps/MODs are countable themselves
  UNION
  SELECT station_id, nomenclature_id FROM bom_walk     -- ...plus every BOM component
  UNION
  SELECT station_id, nomenclature_id FROM public.station_extra_items
)
SELECT
  c.station_id,
  st.code                                              AS station_code,
  st.floor                                             AS station_floor,
  st.location_id,
  n.id                                                 AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name)  AS name,
  n.base_unit,
  n.type,
  CASE WHEN pc.code LIKE 'NF-PKG%' THEN 'packaging' ELSE 'food' END AS item_kind,
  n.cost_per_unit,
  n.count_class,
  COALESCE(oh.on_hand, 0)                              AS batch_on_hand,
  oh.next_expiry,
  COALESCE(oh.expiring_soon, 0)                        AS expiring_soon,
  COALESCE(oh.expired, 0)                              AS expired,
  lc.counted_qty                                       AS last_count,
  lc.created_at                                        AS last_count_at,
  COALESCE(sp.min_stock, n.min_stock)                  AS min_stock,   -- hybrid par (mig 331 pattern)
  COALESCE(sp.par_stock, n.par_stock)                  AS par_stock,
  (lc.created_at IS NULL
   OR lc.created_at < now() - CASE n.count_class
        WHEN 'A' THEN interval '1 day'
        WHEN 'B' THEN interval '7 days'
        ELSE interval '30 days'
      END)                                             AS is_due_today
FROM candidates c
JOIN public.stations st ON st.id = c.station_id AND st.is_active
JOIN public.nomenclature n ON n.id = c.nomenclature_id
  AND COALESCE(n.is_deleted, false) = false
LEFT JOIN public.product_categories pc ON pc.id = n.category_id
LEFT JOIN public.v_stock_on_hand_by_location oh
       ON oh.nomenclature_id = n.id AND oh.location_id = st.location_id
LEFT JOIN public.v_stock_latest_by_location lc
       ON lc.nomenclature_id = n.id AND lc.location_id = st.location_id
LEFT JOIN public.station_par sp
       ON sp.nomenclature_id = n.id AND sp.location_id = st.location_id
WHERE n.type IN ('raw_ingredient', 'semi_finished', 'good')
   OR (n.type = 'modifier' AND NOT EXISTS (
         SELECT 1 FROM public.bom_structures bb WHERE bb.parent_id = n.id));

GRANT SELECT ON public.v_station_checklist TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '351_v_station_checklist.sql',
  'claude-code',
  NULL,
  'Station stock v1 S1: v_station_checklist — auto-derived per-station count list (consumed categories -> items -> recursive BOM walk + dish MOD lines + station_extra_items), food|packaging split via NF-PKG, hybrid par COALESCE(station_par, nomenclature), ABC is_due_today. Leaf MODs countable; SALE dishes excluded.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP VIEW IF EXISTS public.v_station_checklist;
