-- ═══════════════════════════════════════════════════════════════
-- Migration 035: supplier_item_mapping — Smart Mapping Engine
-- Phase 4.6: "Perfect OCR & Smart Mapping Engine"
-- ═══════════════════════════════════════════════════════════════
-- PURPOSE: Remember user's manual item→nomenclature mappings per
--          supplier so the system auto-fills on repeat purchases.
-- ═══════════════════════════════════════════════════════════════

-- ── Table ──
CREATE TABLE IF NOT EXISTS supplier_item_mapping (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku    TEXT,                     -- Makro item code; NULL if supplier has no SKU
  original_name   TEXT NOT NULL,            -- Name as printed on receipt (for name-based fallback)
  nomenclature_id UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  match_count     INT  NOT NULL DEFAULT 1,  -- Popularity counter for ranking
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE supplier_item_mapping IS 'Maps supplier line items (by SKU or name) to internal nomenclature. Populated when user manually maps in StagingArea.';
COMMENT ON COLUMN supplier_item_mapping.supplier_sku IS 'Item code from supplier receipt (e.g. Makro barcode). NULL if supplier has no codes.';
COMMENT ON COLUMN supplier_item_mapping.original_name IS 'Original item name from receipt (Thai or English). Used as fallback lookup key when no SKU.';
COMMENT ON COLUMN supplier_item_mapping.match_count IS 'How many times this mapping was used. Hook sorts by match_count DESC to pick the most popular mapping.';

-- ── Non-unique indexes for fast lookup (CEO rule: no UNIQUE — allow multiple mappings) ──
CREATE INDEX idx_sim_sku  ON supplier_item_mapping(supplier_id, supplier_sku) WHERE supplier_sku IS NOT NULL;
CREATE INDEX idx_sim_name ON supplier_item_mapping(supplier_id, original_name);

-- ── RLS (admin panel uses anon key — all operations must be public) ──
ALTER TABLE supplier_item_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim_select" ON supplier_item_mapping
  FOR SELECT USING (true);

CREATE POLICY "sim_insert" ON supplier_item_mapping
  FOR INSERT WITH CHECK (true);

CREATE POLICY "sim_update" ON supplier_item_mapping
  FOR UPDATE USING (true);

-- ── updated_at trigger ──
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sim_updated_at
  BEFORE UPDATE ON supplier_item_mapping
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
