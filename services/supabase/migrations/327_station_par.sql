-- 327_station_par.sql
-- W1 Connected Stock Model (spec §5 M3, CEO decision §10-A, MC c605e2ca).
--
-- HYBRID par levels. CEO decision (A): a PF that lives at more than one station can
-- carry a per-station par override here; everything else falls back to the GLOBAL
-- nomenclature.min_stock/par_stock/reorder_qty (mig 319). An empty table = pure
-- global behaviour, so v_station_replenishment (mig 329) is correct from day one and
-- overrides are added incrementally via the station dashboard / a seed.
--
-- Same column family + types as nomenclature par (numeric(12,3), base_unit). No CHECK
-- (par >= min) — enforced softly in the UI, mirroring mig 319 (NOT-VALID CHECK would
-- block a half-entered inline-edit row; see repo gotcha).

CREATE TABLE IF NOT EXISTS public.station_par (
  nomenclature_id uuid NOT NULL REFERENCES public.nomenclature(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id)   ON DELETE CASCADE,
  min_stock       numeric(12,3),   -- per-station reorder trigger (base_unit)
  par_stock       numeric(12,3),   -- per-station target on-hand after restock
  reorder_qty     numeric(12,3),   -- per-station fixed pack/round qty; NULL => par - on_hand
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (nomenclature_id, location_id)
);

COMMENT ON TABLE public.station_par IS
  'W1: per-(nomenclature, location) par override. Present only for items tracked at 2+ stations; absent rows fall back to the global nomenclature par (hybrid, CEO §10-A).';

ALTER TABLE public.station_par ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS station_par_read ON public.station_par;
CREATE POLICY station_par_read ON public.station_par
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS station_par_write ON public.station_par;
CREATE POLICY station_par_write ON public.station_par
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '327_station_par.sql',
  'claude-code',
  NULL,
  'W1 (c605e2ca): station_par table (PK nomenclature_id+location_id) for hybrid per-station par overrides; empty => global nomenclature par fallback (CEO §10-A). RLS authenticated r/w.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP TABLE IF EXISTS public.station_par;   -- INTENTIONAL DROP (down-migration only)
