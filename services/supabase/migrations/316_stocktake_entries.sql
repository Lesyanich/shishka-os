-- 316_stocktake_entries.sql
-- Telegram bot revision / stocktake (v1). Append-only physical-count log: the
-- latest CONFIRMED count per (nomenclature, station) is the current physical
-- on-hand. Decoupled from sku_balances (which is purchase-receipt driven) for
-- now — reconciling stocktake → sku_balances is a later phase. A count is first
-- written as 'pending' when the bot parses it, then flipped to 'confirmed' when
-- the staff member approves the parse (or 'cancelled' if they discard it).

CREATE TABLE IF NOT EXISTS public.stocktake_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id uuid NOT NULL REFERENCES public.nomenclature(id) ON DELETE CASCADE,
  station         text NOT NULL DEFAULT 'general' CHECK (station IN ('L1', 'L2', 'general')),
  counted_qty     numeric NOT NULL CHECK (counted_qty >= 0),
  unit            text,        -- base_unit snapshot at count time
  counted_by      text,        -- staff display name
  source_text     text,        -- raw free-text the staff sent (audit)
  status          text NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  session_id      uuid,        -- groups one revision submission
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stocktake_nom_station
  ON public.stocktake_entries (nomenclature_id, station, created_at DESC)
  WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_stocktake_session ON public.stocktake_entries (session_id);

ALTER TABLE public.stocktake_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stocktake_read ON public.stocktake_entries;
CREATE POLICY stocktake_read ON public.stocktake_entries
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS stocktake_write ON public.stocktake_entries;
CREATE POLICY stocktake_write ON public.stocktake_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Latest confirmed physical count per (nomenclature, station).
CREATE OR REPLACE VIEW public.v_stock_latest AS
SELECT DISTINCT ON (s.nomenclature_id, s.station)
  s.nomenclature_id,
  s.station,
  s.counted_qty,
  s.unit,
  s.counted_by,
  s.created_at,
  n.product_code,
  n.name,
  n.base_unit
FROM public.stocktake_entries s
JOIN public.nomenclature n ON n.id = s.nomenclature_id
WHERE s.status = 'confirmed'
ORDER BY s.nomenclature_id, s.station, s.created_at DESC;

GRANT SELECT ON public.v_stock_latest TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '316_stocktake_entries.sql',
  'claude-code',
  NULL,
  'Telegram bot revision/stocktake v1: stocktake_entries append-only log + v_stock_latest (latest count per nomenclature+station)'
)
ON CONFLICT DO NOTHING;
