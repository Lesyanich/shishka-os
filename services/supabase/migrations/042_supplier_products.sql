-- ═══════════════════════════════════════════════════════════════
-- Migration 042: supplier_products — Verified Product Catalog
-- Phase 6.7: Makro SKU Lookup & Anti-Hallucination
-- ═══════════════════════════════════════════════════════════════
-- PURPOSE: Store verified product data from suppliers (Makro, HomePro, etc.)
--          Used as ground-truth cache: GAS checks this table BEFORE scraping
--          makro.pro. Gradually populated by Makro API lookups and manual entry.
--
-- WHY SEPARATE FROM supplier_item_mapping?
--   supplier_item_mapping requires nomenclature_id (NOT NULL FK) —
--   it's a mapping from receipt items to OUR products.
--   supplier_products is a CATALOG — what the supplier actually sells,
--   independent of whether we've mapped it to our nomenclature.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supplier_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  barcode         TEXT NOT NULL,
  product_name    TEXT NOT NULL,            -- Verified English name (e.g. "Whole Wheat Flour")
  product_name_th TEXT,                     -- Thai name if available
  brand           TEXT,                     -- Brand (IMPERIAL, KNORR, ARO, etc.)
  package_weight  TEXT,                     -- Package weight as string ("1 kg", "500 g")
  category        TEXT NOT NULL DEFAULT 'food',  -- food / capex / opex
  last_seen_price NUMERIC,                  -- Last known price at supplier
  source          TEXT NOT NULL DEFAULT 'manual', -- 'makro_api', 'manual', 'receipt_ocr'
  verified_at     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE supplier_products IS 'Verified product catalog from suppliers. Ground-truth for receipt parsing — checked before AI translation.';
COMMENT ON COLUMN supplier_products.barcode IS 'Product barcode/SKU (EAN-13 or supplier internal code)';
COMMENT ON COLUMN supplier_products.product_name IS 'Verified English product name — clean, no brand/weight in the name';
COMMENT ON COLUMN supplier_products.source IS 'How the data was obtained: makro_api (from makro.pro), manual (human entry), receipt_ocr (from OCR)';

-- One product per supplier+barcode (upsert-friendly)
CREATE UNIQUE INDEX idx_sp_supplier_barcode ON supplier_products(supplier_id, barcode);

-- Fast barcode lookup (when supplier_id is not known yet)
CREATE INDEX idx_sp_barcode ON supplier_products(barcode);

-- ── RLS (admin panel uses anon key) ──
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_select" ON supplier_products FOR SELECT USING (true);
CREATE POLICY "sp_insert" ON supplier_products FOR INSERT WITH CHECK (true);
CREATE POLICY "sp_update" ON supplier_products FOR UPDATE USING (true);

-- ── updated_at trigger (reuse fn_set_updated_at from migration 035) ──
CREATE TRIGGER trg_sp_updated_at
  BEFORE UPDATE ON supplier_products
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Verified products from Makro receipt 062501118002
-- Date: 27-02-2026, Source: makro.pro API verification
-- ═══════════════════════════════════════════════════════════════

INSERT INTO supplier_products (supplier_id, barcode, product_name, product_name_th, brand, package_weight, category, last_seen_price, source)
SELECT s.id, v.barcode, v.product_name, v.product_name_th, v.brand, v.package_weight, v.category, v.price, v.source
FROM (VALUES
  -- Makro-verified products (from makro.pro __NEXT_DATA__)
  ('917475',         'Parsley',                  'พาร์สลีย์',              'MAKRO',    '100 g',  'food', 35,  'makro_api'),
  ('923317',         'Lemon Pack',               'มะนาวเหลือเเพ็ค',        'MAKRO',    '4 pcs',  'food', 69,  'makro_api'),
  ('9300657790028',  'Frozen Green Pea',         'ถั่วลันเตาแช่แข็ง',       'WATTIE''S', '1 kg',  'food', 99,  'makro_api'),
  ('8850144074038',  'Corn Flour',               'แป้งข้าวโพด',             'KNORR',    '700 g',  'food', 70,  'makro_api'),
  ('8850332193282',  'Whole Wheat Flour',        'แป้งสาลีโฮลวีท',          'IMPERIAL', '1 kg',   'food', 225, 'makro_api'),
  ('8850332162240',  'Unsalted Compound Butter', 'เนยเทียมจืด',             'ALLOWRIE', '2 kg',   'food', 419, 'makro_api'),
  ('8850340200323',  'Glutinous Rice Flour',     'แป้งข้าวเหนียว',          'aro',      '1 kg',   'food', 40,  'makro_api'),
  ('8850340301181',  'Tapioca Starch',           'แป้งมันสำปะหลัง',         'aro',      '1 kg',   'food', 34,  'makro_api'),
  ('8851988008401',  'Chicken Egg no.3-4',       'ไข่ไก่คละเบอร์3-4',       'ARO',      '30 pcs', 'food', 103, 'makro_api'),
  ('826825',         'Basil Leaf',               'ใบกะเพรา',               'MAKRO',    '300 g',  'food', 29,  'makro_api'),
  ('826827',         'Mint Leaf',                'ใบสะระแหน่',              'MAKRO',    '300 g',  'food', 49,  'makro_api'),
  -- Receipt-verified products (readable from receipt image, not on makro.pro online)
  ('8850885374264',  'Ovaltine Ovanmalt',        'โอวัลติน',               'Ovaltine', '105 g',  'food', 105, 'receipt_ocr'),
  ('8850332913261',  'Red Chili Paste',          'วันทิพ พริกแดง',          'Wanthip',  '946 cc', 'food', 132, 'receipt_ocr'),
  ('8850880015004',  'Fresh Cream',              'ครีมสด',                 NULL,       '450 g',  'food', 205, 'receipt_ocr'),
  ('890611155789',   'Roasted Almonds',          'อัลมอนด์คั่ว',            NULL,       '800 g',  'food', 72,  'receipt_ocr'),
  ('8850338372562',  'Baking Powder',            'ผงฟู',                   'McGarrett','1 kg',   'food', 225, 'receipt_ocr'),
  ('8851032464800',  'Lemon Turbo Dishwashing Liquid', 'ซันไลท์เลมอนเทอร์โบ', 'Sunlight', '3.2 L', 'opex', 149, 'receipt_ocr')
) AS v(barcode, product_name, product_name_th, brand, package_weight, category, price, source)
CROSS JOIN (SELECT id FROM suppliers WHERE LOWER(name) LIKE '%makro%' LIMIT 1) s
ON CONFLICT (supplier_id, barcode) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  brand = EXCLUDED.brand,
  package_weight = EXCLUDED.package_weight,
  last_seen_price = EXCLUDED.last_seen_price,
  source = EXCLUDED.source,
  verified_at = now(),
  updated_at = now();
