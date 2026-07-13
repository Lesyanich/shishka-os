-- 353a_station_count_mode_finished.sql
-- Station stock v1: reheat/finished stations count the FINISHED unit, not ingredients.
-- CEO caught Manakish L2 showing raw ingredients — but L2 only RECEIVES the frozen
-- assembled manakish (a PF, produced by the cook-chill BOM re-level) and reheats it.
-- So a reheat station must count at the frozen-PF level (direct children of its dishes),
-- not walk the BOM down to raw. Add stations.count_mode; gate the recursive BOM walk on it.
--
-- Prerequisite DATA change (applied to prod 2026-07-03, NOT a migration — chef/BOM data):
-- every active SALE-MANAISH_* was re-levelled to `1x PF-MANAISH_<flavor>_FROZEN + packaging`,
-- the frozen PF holding the former food components. cost + КБЖУ preserved exactly (0.00 drift).
-- Verified: Manakish L2 checklist = 16 frozen-PF units + 1 packaging (was 48 raw lines).

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS count_mode text NOT NULL DEFAULT 'components'
    CHECK (count_mode IN ('components', 'finished'));

COMMENT ON COLUMN public.stations.count_mode IS
  'components = count leaf ingredients (prep/assemble-from-scratch: Bar, Salad-bar, L1). '
  'finished = count the direct components the station RECEIVES ready-made (reheat/service: Manakish L2) — BOM walk stops at depth 1.';

-- Manakish L2 receives finished frozen manakish + reheats → count the frozen PFs.
UPDATE public.stations SET count_mode = 'finished' WHERE code = 'manakish';

CREATE OR REPLACE VIEW public.v_station_checklist AS
 WITH RECURSIVE mapped_items AS (
         SELECT sc.station_id, n_1.id AS nomenclature_id
           FROM station_categories sc
             JOIN nomenclature n_1 ON n_1.category_id = sc.category_id
          WHERE sc.role = 'consumes'::text AND COALESCE(n_1.is_deleted, false) = false
            AND n_1.name !~~ '[ARCHIVED]%'::text AND n_1.name !~~ '[REPLACED]%'::text
        ), modifier_items AS (
         SELECT DISTINCT mi.station_id, mo.modifier_id AS nomenclature_id
           FROM mapped_items mi
             JOIN nomenclature_modifier_options mo ON mo.dish_id = mi.nomenclature_id
          WHERE mo.modifier_id IS NOT NULL
        ), roots AS (
         SELECT mapped_items.station_id, mapped_items.nomenclature_id FROM mapped_items
        UNION
         SELECT modifier_items.station_id, modifier_items.nomenclature_id FROM modifier_items
        ), bom_walk AS (
         SELECT r.station_id, b.ingredient_id AS nomenclature_id,
            ARRAY[r.nomenclature_id, b.ingredient_id] AS path, 1 AS depth
           FROM roots r
             JOIN bom_structures b ON b.parent_id = r.nomenclature_id
        UNION
         SELECT w.station_id, b.ingredient_id, w.path || b.ingredient_id, w.depth + 1
           FROM bom_walk w
             JOIN bom_structures b ON b.parent_id = w.nomenclature_id
             JOIN stations sst ON sst.id = w.station_id
          WHERE w.depth < 6 AND NOT (b.ingredient_id = ANY (w.path))
            AND sst.count_mode = 'components'::text
        ), candidates AS (
         SELECT roots.station_id, roots.nomenclature_id FROM roots
        UNION
         SELECT bom_walk.station_id, bom_walk.nomenclature_id FROM bom_walk
        UNION
         SELECT station_extra_items.station_id, station_extra_items.nomenclature_id FROM station_extra_items
        )
 SELECT c.station_id,
    st.code AS station_code,
    st.floor AS station_floor,
    st.location_id,
    n.id AS nomenclature_id,
    n.product_code,
    COALESCE(NULLIF(n.customer_short_name, ''::text), n.name) AS name,
    n.base_unit,
    n.type,
        CASE WHEN pc.code ~~ 'NF-PKG%'::text THEN 'packaging'::text ELSE 'food'::text END AS item_kind,
    n.cost_per_unit,
    n.count_class,
    COALESCE(oh.on_hand, 0::numeric) AS batch_on_hand,
    oh.next_expiry,
    COALESCE(oh.expiring_soon, 0::bigint) AS expiring_soon,
    COALESCE(oh.expired, 0::bigint) AS expired,
    lc.counted_qty AS last_count,
    lc.created_at AS last_count_at,
    COALESCE(sp.min_stock, n.min_stock) AS min_stock,
    COALESCE(sp.par_stock, n.par_stock) AS par_stock,
    lc.created_at IS NULL OR lc.created_at < (now() -
        CASE n.count_class WHEN 'A'::text THEN '1 day'::interval WHEN 'B'::text THEN '7 days'::interval ELSE '30 days'::interval END) AS is_due_today
   FROM candidates c
     JOIN stations st ON st.id = c.station_id AND st.is_active
     JOIN nomenclature n ON n.id = c.nomenclature_id AND COALESCE(n.is_deleted, false) = false
     LEFT JOIN product_categories pc ON pc.id = n.category_id
     LEFT JOIN v_stock_on_hand_by_location oh ON oh.nomenclature_id = n.id AND oh.location_id = st.location_id
     LEFT JOIN v_stock_latest_by_location lc ON lc.nomenclature_id = n.id AND lc.location_id = st.location_id
     LEFT JOIN station_par sp ON sp.nomenclature_id = n.id AND sp.location_id = st.location_id
  WHERE (n.type = ANY (ARRAY['raw_ingredient'::text, 'semi_finished'::text, 'good'::text]))
     OR n.type = 'modifier'::text AND NOT (EXISTS ( SELECT 1 FROM bom_structures bb WHERE bb.parent_id = n.id));

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('353a_station_count_mode_finished.sql','claude-code',NULL,
  'Station stock v1: stations.count_mode (components|finished); Manakish L2 = finished (BOM walk stops at depth 1 → counts frozen PFs post cook-chill re-level, not raw ingredients).')
ON CONFLICT DO NOTHING;
