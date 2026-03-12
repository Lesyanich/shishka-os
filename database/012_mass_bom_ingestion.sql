-- Migration 012: Mass Ingestion of BOM Structures from Chef Records
-- Ingesting Mirepoix, Borsch, Broth, and Fermented Cabbage

WITH items AS (
    SELECT id, product_code FROM nomenclature
)
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct)
VALUES
-- PF-VEGETABLE_BROTH
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-RO_WATER'), 1.17, NULL),
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-ROOT_TRIMMINGS'), 0.1, NULL),
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-ONION_TRIMMINGS'), 0.067, NULL),
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-HERB_STEMS'), 0.017, NULL),
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-MUSHROOM_STEMS'), 0.033, NULL),
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-CABBAGE_CORES'), 0.033, NULL),
((SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), (SELECT id FROM items WHERE product_code = 'RAW-SHISHKA_MIX'), 0.0017, NULL),

-- PF-MIREPOIX_SAUTE
((SELECT id FROM items WHERE product_code = 'PF-MIREPOIX_SAUTE'), (SELECT id FROM items WHERE product_code = 'RAW-ONION'), 0.606, 0.85),
((SELECT id FROM items WHERE product_code = 'PF-MIREPOIX_SAUTE'), (SELECT id FROM items WHERE product_code = 'RAW-FRESH_CARROT'), 0.606, 0.8),
((SELECT id FROM items WHERE product_code = 'PF-MIREPOIX_SAUTE'), (SELECT id FROM items WHERE product_code = 'RAW-OLIVE_OIL'), 0.121, NULL),
((SELECT id FROM items WHERE product_code = 'PF-MIREPOIX_SAUTE'), (SELECT id FROM items WHERE product_code = 'RAW-SHISHKA_MIX'), 0.061, NULL),

-- PF-BAKED_BEETROOT
((SELECT id FROM items WHERE product_code = 'PF-BAKED_BEETROOT'), (SELECT id FROM items WHERE product_code = 'RAW-RAW_BEETROOT'), 1.764, 0.7),

-- PF-BORSCH_BASE
((SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), (SELECT id FROM items WHERE product_code = 'PF-VEGETABLE_BROTH'), 0.7181, NULL),
((SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), (SELECT id FROM items WHERE product_code = 'PF-MIREPOIX_SAUTE'), 0.1026, NULL),
((SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), (SELECT id FROM items WHERE product_code = 'PF-BAKED_BEETROOT'), 0.1539, NULL),
((SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), (SELECT id FROM items WHERE product_code = 'RAW-FRESH_POTATO'), 0.1026, 0.75),
((SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), (SELECT id FROM items WHERE product_code = 'RAW-LEMON_JUICE'), 0.0103, NULL),
((SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), (SELECT id FROM items WHERE product_code = 'RAW-GARLIC'), 0.0051, 0.95),

-- PF-FERMENTED_CABBAGE
((SELECT id FROM items WHERE product_code = 'PF-FERMENTED_CABBAGE'), (SELECT id FROM items WHERE product_code = 'RAW-WHITE_CABBAGE'), 0.9, NULL),
((SELECT id FROM items WHERE product_code = 'PF-FERMENTED_CABBAGE'), (SELECT id FROM items WHERE product_code = 'RAW-FRESH_CARROT'), 0.1, 0.8),
((SELECT id FROM items WHERE product_code = 'PF-FERMENTED_CABBAGE'), (SELECT id FROM items WHERE product_code = 'RAW-FINE_SALT'), 0.018, NULL),

-- Portions (SALE)
((SELECT id FROM items WHERE product_code = 'SALE-BORSCH_BIOACTIVE'), (SELECT id FROM items WHERE product_code = 'PF-BORSCH_BASE'), 0.3, NULL),
((SELECT id FROM items WHERE product_code = 'SALE-KRAUT_SIDE'), (SELECT id FROM items WHERE product_code = 'PF-FERMENTED_CABBAGE'), 0.08, NULL)
ON CONFLICT DO NOTHING;
