-- 330_v_stock_on_hand_by_location.sql
-- W1 Connected Stock Model (spec §3.1 / §5 M2, CEO decision §10-C, MC c605e2ca).
--
-- The foundation primitive: "how much of X sits at station Y, right now."
-- CEO decision (C): inventory_batches is the PHYSICAL source of truth (it is the only
-- station-aware, expiry-aware, FIFO store). Per-station on-hand is DERIVED from it —
-- no new balances table. Live batch = status in (sealed, opened, produced).
--
-- weight is assumed to be in the item's base_unit (see spec §8 unit-integrity invariant;
-- fn_apply_stocktake asserts unit == base_unit on the count side).

CREATE OR REPLACE VIEW public.v_stock_on_hand_by_location AS
SELECT
  b.nomenclature_id,
  b.location_id,
  l.name                                                      AS location_name,
  l.type                                                      AS location_type,
  SUM(b.weight)                                               AS on_hand,
  COUNT(*)                                                    AS live_batches,
  MIN(b.expires_at)                                           AS next_expiry,
  COUNT(*) FILTER (WHERE b.expires_at <= now() + interval '2 days') AS expiring_soon,
  COUNT(*) FILTER (WHERE b.expires_at <= now())              AS expired
FROM public.inventory_batches b
JOIN public.locations l ON l.id = b.location_id
WHERE b.status IN ('sealed', 'opened', 'produced')
GROUP BY b.nomenclature_id, b.location_id, l.name, l.type;

GRANT SELECT ON public.v_stock_on_hand_by_location TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '330_v_stock_on_hand_by_location.sql',
  'claude-code',
  NULL,
  'W1 (c605e2ca): v_stock_on_hand_by_location — per-(nomenclature, location) on-hand derived from live inventory_batches (CEO §10-C: batches = source of truth). Carries batch/expiry rollup.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP VIEW IF EXISTS public.v_stock_on_hand_by_location;
