-- ═══════════════════════════════════════════════════════════════
-- Migration 198: Add Soignon Goat Cheese (Villa Market) to supplier_catalog
-- Task: b82c5e65 — establish WAC for RAW-CHEESE_GOAT
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: RAW-CHEESE_GOAT has cost_per_unit=0 (never purchased through system).
-- CEO identified product: Soignon Goat Cheese, Villa Market, ฿249/200g = ฿1,245/kg.
--
-- ACTIONS:
--   1. Add supplier_catalog entry (Villa Market → RAW-CHEESE_GOAT)
--   2. Insert purchase_log → triggers fn_update_cost_on_purchase (WAC)
--      First purchase with zero inventory → WAC = purchase price = 1245/kg
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Supplier catalog entry ───
INSERT INTO public.supplier_catalog (
    supplier_id,
    nomenclature_id,
    product_name,
    brand,
    package_weight,
    package_qty,
    package_unit,
    purchase_unit,
    conversion_factor,
    base_unit,
    last_seen_price,
    source
) VALUES (
    '96117a1d-d056-4f49-b83c-7d998dcbe139',  -- Villa Market
    '326e235f-bc4c-4331-b7c0-0155890ce164',  -- RAW-CHEESE_GOAT
    'Soignon Goat Cheese',
    'Soignon',
    '200g',
    1,
    'pack',
    'pack',
    0.2,        -- 1 pack = 0.2 kg
    'kg',
    249,        -- ฿249 per pack
    'manual'
)
ON CONFLICT DO NOTHING;

-- ─── 2. Record first purchase to establish WAC ───
-- ฿249 / 0.2 kg = ฿1,245/kg
INSERT INTO public.purchase_logs (
    nomenclature_id,
    supplier_id,
    quantity,
    price_per_unit,
    total_price,
    invoice_date,
    notes
) VALUES (
    '326e235f-bc4c-4331-b7c0-0155890ce164',  -- RAW-CHEESE_GOAT
    '96117a1d-d056-4f49-b83c-7d998dcbe139',  -- Villa Market
    0.2,          -- 200g = 0.2 kg
    1245,         -- ฿1,245 per kg
    249,          -- ฿249 total (1 pack)
    '2026-05-18',
    'Initial purchase to establish WAC. Soignon Goat Cheese 200g from Villa Market.'
);
-- ↑ Triggers fn_update_cost_on_purchase → sets nomenclature.cost_per_unit = 1245

-- ─── 3. Self-register in migration_log ───
INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '200a_add_goat_cheese_villa_market.sql',
  'claude-code',
  'Add Soignon Goat Cheese (Villa Market) to supplier_catalog + purchase_log to establish WAC at 1245 THB/kg for RAW-CHEESE_GOAT.'
) ON CONFLICT (filename) DO NOTHING;
