-- 349_stocktake_sessions.sql
-- Station stock v1 (S1). The stocktake DOCUMENT (CEO: "каждую сверку стоков
-- надо документировать") — Syrve-style: open a session per station, staff
-- record counted numbers as draft lines, submit, owner reviews variance and
-- applies. History of applied sessions = the audit trail.
--
-- Line-item storage deliberately reuses stocktake_entries PENDING rows as the
-- session's draft lines — the exact staging pattern the Telegram bot shipped
-- with (stage pending per session_id -> confirm -> fn_apply_stocktake inserts
-- the canonical confirmed row -> delete staging). One line-item store, no
-- parallel table, and v_stock_latest* (confirmed-only) never sees drafts.
--
-- NO FK from stocktake_entries.session_id to stocktake_sessions: the bot
-- generates ad-hoc session uuids with no session row (kept as-is on purpose).
--
-- stocktake_entries.station stays the legacy floor code ('L1'|'L2'|'general');
-- fine-grained precision is the new entries.location_id + session.station_id.
-- Widening that CHECK would desync fn_apply_stocktake's derivation and the
-- bot's vocabulary for zero gain.

-- ── 1. The document ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stocktake_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number    text NOT NULL UNIQUE,          -- 'ST-20260703-01' (ICT date), set by fn_open_stocktake_session
  station_id    uuid NOT NULL REFERENCES public.stations(id),
  location_id   uuid NOT NULL REFERENCES public.locations(id),  -- snapshot of the station anchor at open time
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'applied', 'cancelled')),
  is_baseline   boolean NOT NULL DEFAULT false, -- first count at a fresh station: seed truth, no variance spam
  scope         text NOT NULL DEFAULT 'food' CHECK (scope IN ('food', 'packaging', 'full')),
  counted_by    text,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  applied_at    timestamptz,
  applied_by    text,
  entries_count int,                            -- stamped at apply
  variance_value_thb numeric,                   -- Σ (counted - book) × cost_per_unit, stamped at apply
  summary       jsonb,                          -- per-line variance + routing snapshot (audit)
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One active document per station+scope (a second "open Bar food count" is a
-- mistake, not a feature).
CREATE UNIQUE INDEX IF NOT EXISTS ux_stocktake_sessions_active
  ON public.stocktake_sessions (station_id, scope)
  WHERE status IN ('draft', 'submitted');

CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_station
  ON public.stocktake_sessions (station_id, opened_at DESC);

CREATE OR REPLACE FUNCTION public.trg_touch_stocktake_sessions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stocktake_sessions_updated_at ON public.stocktake_sessions;
CREATE TRIGGER trg_stocktake_sessions_updated_at
  BEFORE UPDATE ON public.stocktake_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_stocktake_sessions();

ALTER TABLE public.stocktake_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stocktake_sessions_read ON public.stocktake_sessions;
CREATE POLICY stocktake_sessions_read ON public.stocktake_sessions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stocktake_sessions_write ON public.stocktake_sessions;
CREATE POLICY stocktake_sessions_write ON public.stocktake_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.stocktake_sessions TO authenticated;

-- ── 2. stocktake_entries: fine location + draft-line upsert key ────────────

-- Latent bug this fixes: with multiple L2 stations, v_stock_latest's
-- DISTINCT ON (nomenclature, station='L2') would mix Bar and Manakish counts.
ALTER TABLE public.stocktake_entries
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

COMMENT ON COLUMN public.stocktake_entries.location_id IS
  'Fine-grained station anchor (locations.id) this count belongs to. NULL = legacy/bot coarse count; station column stays the floor code.';

-- One draft line per item per session -> re-typing a number is an upsert.
CREATE UNIQUE INDEX IF NOT EXISTS ux_stocktake_entries_pending_line
  ON public.stocktake_entries (session_id, nomenclature_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_stocktake_entries_location
  ON public.stocktake_entries (nomenclature_id, location_id, created_at DESC)
  WHERE status = 'confirmed' AND location_id IS NOT NULL;

-- ── 3. Latest confirmed count per (nomenclature, fine location) ─────────────
-- v_stock_latest (per floor) stays frozen for the bot; this is the precise one.

CREATE OR REPLACE VIEW public.v_stock_latest_by_location AS
SELECT DISTINCT ON (s.nomenclature_id, s.location_id)
  s.nomenclature_id,
  s.location_id,
  s.counted_qty,
  s.unit,
  s.counted_by,
  s.session_id,
  s.created_at,
  n.product_code,
  n.name,
  n.base_unit
FROM public.stocktake_entries s
JOIN public.nomenclature n ON n.id = s.nomenclature_id
WHERE s.status = 'confirmed' AND s.location_id IS NOT NULL
ORDER BY s.nomenclature_id, s.location_id, s.created_at DESC;

GRANT SELECT ON public.v_stock_latest_by_location TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '349_stocktake_sessions.sql',
  'claude-code',
  NULL,
  'Station stock v1 S1: stocktake_sessions document (doc_number, draft->submitted->applied|cancelled, is_baseline, scope, variance rollup; one active per station+scope) + stocktake_entries.location_id + pending-line upsert index + v_stock_latest_by_location. Draft lines = pending entries (bot staging pattern). No FK on session_id (bot ad-hoc uuids).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP VIEW IF EXISTS public.v_stock_latest_by_location;
-- DROP INDEX IF EXISTS public.ux_stocktake_entries_pending_line;
-- DROP INDEX IF EXISTS public.idx_stocktake_entries_location;
-- ALTER TABLE public.stocktake_entries DROP COLUMN IF EXISTS location_id;
-- DROP TRIGGER IF EXISTS trg_stocktake_sessions_updated_at ON public.stocktake_sessions;
-- DROP FUNCTION IF EXISTS public.trg_touch_stocktake_sessions();
-- DROP TABLE IF EXISTS public.stocktake_sessions;  -- INTENTIONAL DROP (down-path only)
