-- Channel pricing: per-channel price overrides (Grab, Line Man, own delivery).
-- Walk-in price stays in nomenclature.price. Channel price is either a manual
-- override (price) or computed from walk-in × multiplier. Commission stored
-- for margin calculation.

CREATE TABLE channel_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  price NUMERIC,
  multiplier NUMERIC,
  commission_pct NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(nomenclature_id, channel),
  CHECK (price IS NOT NULL OR multiplier IS NOT NULL)
);

COMMENT ON TABLE channel_pricing IS 'Per-channel price overrides. Effective price = COALESCE(cp.price, n.price * cp.multiplier). One row per (item, channel).';
COMMENT ON COLUMN channel_pricing.channel IS 'Channel slug: grab, lineman, own_delivery, etc.';
COMMENT ON COLUMN channel_pricing.price IS 'Manual override price (THB). NULL = use multiplier × walk-in price.';
COMMENT ON COLUMN channel_pricing.multiplier IS 'Auto-calc multiplier applied to nomenclature.price. e.g. 1.15 = +15%.';
COMMENT ON COLUMN channel_pricing.commission_pct IS 'Channel commission as decimal. e.g. 0.30 = 30% Grab commission.';

-- updated_at trigger (reuse pattern from nomenclature)
CREATE OR REPLACE FUNCTION trg_channel_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channel_pricing_updated_at
  BEFORE UPDATE ON channel_pricing
  FOR EACH ROW
  EXECUTE FUNCTION trg_channel_pricing_updated_at();

-- RLS
ALTER TABLE channel_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_pricing_select_authenticated"
  ON channel_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "channel_pricing_insert_service"
  ON channel_pricing FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "channel_pricing_update_service"
  ON channel_pricing FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "channel_pricing_delete_service"
  ON channel_pricing FOR DELETE
  TO service_role
  USING (true);

-- Index for fast lookup by channel
CREATE INDEX idx_channel_pricing_channel ON channel_pricing(channel);

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '201_channel_pricing.sql',
    'claude-code',
    'Create channel_pricing table with RLS, updated_at trigger, unique(nomenclature_id, channel)'
) ON CONFLICT (filename) DO NOTHING;
