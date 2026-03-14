-- ═══════════════════════════════════════════════════════════
-- Migration 066: Syrve Integration Foundation
-- Phase 17: Nomenclature mapping, sync queue, UoM, tax
-- ═══════════════════════════════════════════════════════════

-- ── 1. Mapping columns on existing tables ──

ALTER TABLE nomenclature ADD COLUMN IF NOT EXISTS syrve_uuid UUID;
ALTER TABLE nomenclature ADD COLUMN IF NOT EXISTS syrve_tax_category_id UUID;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS syrve_uuid UUID;

-- Sync tracking on outbound documents
ALTER TABLE expense_ledger ADD COLUMN IF NOT EXISTS syrve_synced BOOLEAN DEFAULT false;
ALTER TABLE expense_ledger ADD COLUMN IF NOT EXISTS syrve_doc_id TEXT;

-- ── 2. syrve_config — key/value store for API credentials ──

CREATE TABLE IF NOT EXISTS syrve_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed defaults (values to be filled via UI)
INSERT INTO syrve_config (key, value) VALUES
  ('api_login', ''),
  ('base_url', 'https://api-eu.syrve.live/api/1'),
  ('organization_id', ''),
  ('store_id', ''),
  ('default_tax_category_id', ''),
  ('vat_rate', '7')
ON CONFLICT (key) DO NOTHING;

-- ── 3. syrve_sync_queue — Fire-and-Forget Outbox Pattern ──
-- Decouples Shishka OS transactions from Syrve API availability.
-- approve functions INSERT here atomically; async worker processes later.

CREATE TABLE IF NOT EXISTS syrve_sync_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type       TEXT NOT NULL CHECK (sync_type IN ('purchase_invoice', 'writeoff', 'nomenclature')),
  ref_id          UUID,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'synced', 'error', 'failed')),
  attempts        INT DEFAULT 0,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  synced_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_syrve_sync_queue_pending
  ON syrve_sync_queue (status, next_retry_at)
  WHERE status IN ('pending', 'error');

-- ── 4. syrve_sync_log — Audit trail for all sync operations ──

CREATE TABLE IF NOT EXISTS syrve_sync_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type      TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('pull', 'push')),
  status         TEXT NOT NULL CHECK (status IN ('success', 'error')),
  records_count  INT DEFAULT 0,
  error_message  TEXT,
  payload        JSONB,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── 5. syrve_uom_map — Unit of Measure conversion ──
-- Handles: Shishka buys in 'boxes', Syrve expects 'liters'

CREATE TABLE IF NOT EXISTS syrve_uom_map (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id   UUID NOT NULL REFERENCES nomenclature(id),
  shishka_unit      TEXT NOT NULL,
  syrve_unit        TEXT NOT NULL,
  syrve_uom_id      UUID,
  conversion_factor NUMERIC NOT NULL CHECK (conversion_factor > 0),
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (nomenclature_id, shishka_unit)
);

-- ── 6. syrve_sales — Pulled from Syrve POS (Phase 19) ──

CREATE TABLE IF NOT EXISTS syrve_sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syrve_order_id   TEXT,
  nomenclature_id  UUID REFERENCES nomenclature(id),
  product_name     TEXT,
  quantity         NUMERIC,
  amount           NUMERIC,
  cost_amount      NUMERIC,
  sale_date        DATE,
  payment_type     TEXT,
  synced_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_syrve_sales_date
  ON syrve_sales (sale_date);

-- ── 7. RPC: Get syrve config (for Edge Functions) ──

CREATE OR REPLACE FUNCTION fn_get_syrve_config()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT jsonb_object_agg(key, value)
  FROM syrve_config;
$$;

-- ── 8. RPC: Upsert syrve config ──

CREATE OR REPLACE FUNCTION fn_upsert_syrve_config(
  p_key TEXT,
  p_value TEXT
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO syrve_config (key, value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = p_value, updated_at = now();
$$;

-- ── 9. RPC: Save nomenclature syrve_uuid mapping ──

CREATE OR REPLACE FUNCTION fn_save_syrve_mapping(
  p_nomenclature_id UUID,
  p_syrve_uuid UUID,
  p_syrve_tax_category_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  UPDATE nomenclature
  SET syrve_uuid = p_syrve_uuid,
      syrve_tax_category_id = COALESCE(p_syrve_tax_category_id, syrve_tax_category_id)
  WHERE id = p_nomenclature_id;
$$;

-- ═══════════════════════════════════════════════════════════
-- END Migration 066
-- ═══════════════════════════════════════════════════════════
