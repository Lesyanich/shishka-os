-- 328_stock_movements_location.sql
-- W1 Connected Stock Model (spec §5 M1, MC c605e2ca).
--
-- Adds the station/warehouse dimension to the stock_movements ledger so a count
-- adjustment or a depletion can be attributed to a specific location. Today
-- stock_movements is global (order-driven sales depletion only). fn_apply_stocktake
-- (mig 333) writes a location-scoped 'stocktake_adj' row here as the audit trail of
-- the discrepancy between a physical count and the batch-derived on-hand.
--
-- Pure additive: 1 nullable FK column + 1 partial index. NULL = legacy/global row.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS location_id uuid
    REFERENCES public.locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stock_movements.location_id IS
  'W1: warehouse/station this movement is attributed to (locations.id). NULL = legacy global movement (pre-station, or sales depletion not yet station-scoped).';

-- Station-scoped movement scans (reconciliation, per-station adjustment history).
CREATE INDEX IF NOT EXISTS idx_stock_movements_location
  ON public.stock_movements (location_id, nomenclature_id)
  WHERE location_id IS NOT NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '328_stock_movements_location.sql',
  'claude-code',
  NULL,
  'W1 (c605e2ca): add nullable location_id FK + partial index to stock_movements so count adjustments/depletions are station-attributable. Additive, NULL=legacy global.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP INDEX IF EXISTS public.idx_stock_movements_location;
-- ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS location_id;
