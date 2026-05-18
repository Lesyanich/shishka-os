-- Migration 197 — order persistence columns + order_item_modifiers table
-- Adds loyverse_receipt_id, loyverse_raw, received_at to orders.
-- Creates order_item_modifiers with RLS (security-critical; not in original spec, added with CEO approval).
-- Extends order_source + order_status enums with 'loyverse' and 'received'.

BEGIN;

-- 1. Enum extensions
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'loyverse';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'received';

-- 2. New provenance columns on orders
ALTER TABLE orders
  ADD COLUMN loyverse_receipt_id TEXT UNIQUE,
  ADD COLUMN loyverse_raw JSONB,
  ADD COLUMN received_at TIMESTAMPTZ;

CREATE INDEX idx_orders_loyverse_receipt
  ON orders(loyverse_receipt_id)
  WHERE loyverse_receipt_id IS NOT NULL;

COMMENT ON COLUMN orders.loyverse_receipt_id IS
  'Loyverse receipt_number. UNIQUE; used for idempotency in fn_ingest_loyverse_receipt.';
COMMENT ON COLUMN orders.loyverse_raw IS
  'Full Loyverse receipt payload snapshotted at ingest time.';
COMMENT ON COLUMN orders.received_at IS
  'Timestamp when the receipt was ingested from Loyverse (≈ close-of-sale in Loyverse).';

-- 3. order_item_modifiers table
CREATE TABLE order_item_modifiers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id        UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_option_id   UUID REFERENCES nomenclature_modifier_options(id) ON DELETE SET NULL,
  modifier_id          UUID REFERENCES nomenclature(id) ON DELETE SET NULL,
  slot                 TEXT CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce')),
  quantity             NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_delta_paid     NUMERIC NOT NULL DEFAULT 0,
  loyverse_modifier_id   TEXT,
  loyverse_modifier_name TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_item_modifiers IS
  'Per-line-item modifier rows ingested from Loyverse receipts. Snapshot columns (loyverse_modifier_id, loyverse_modifier_name) are preserved even if the mapping is later deleted, so historical orders remain readable.';

-- 4. Indexes
CREATE INDEX idx_oim_order_item
  ON order_item_modifiers(order_item_id);

CREATE INDEX idx_oim_modifier
  ON order_item_modifiers(modifier_id)
  WHERE modifier_id IS NOT NULL;

CREATE INDEX idx_oim_slot
  ON order_item_modifiers(slot)
  WHERE slot IS NOT NULL;

-- 5. RLS (mirrors orders + order_items policy pattern)
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_full_access ON order_item_modifiers
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '197_order_modifiers_persistence.sql',
  'claude-code',
  'Extend order_source/order_status enums; add loyverse_* columns to orders; create order_item_modifiers with RLS. Lego flow M4.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
