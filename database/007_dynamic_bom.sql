-- Migration 007: Dynamic BOM and Ingestion
-- Goal: Expand nomenclature with new recipe items and implement proportional BOM structures.

-- 1. Create bom_structures table
CREATE TABLE public.bom_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.nomenclature(id),
    ingredient_id UUID REFERENCES public.nomenclature(id),
    quantity_per_unit NUMERIC NOT NULL, -- Gross Input / 1 Unit of Output
    yield_loss_pct NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(parent_id, ingredient_id)
);

-- 2. Expand Nomenclature
-- New Raw Materials
INSERT INTO public.nomenclature (product_code, name, type, base_unit) VALUES
('RAW-PUMPKIN', 'Raw Pumpkin', 'good', 'kg'),
('RAW-COCONUT_MILK', 'Coconut Milk 17-19%', 'good', 'L'),
('RAW-FRESH_GINGER', 'Fresh Ginger', 'good', 'kg'),
('RAW-TURMERIC_POWDER', 'Turmeric Powder (Dry)', 'good', 'kg'),
('RAW-CORIANDER_POWDER', 'Coriander Seed Powder', 'good', 'kg'),
('RAW-SEA_SALT', 'Sea Salt (Fine)', 'good', 'kg');

-- New Semi-Finished Products
INSERT INTO public.nomenclature (product_code, name, type, base_unit, standard_output_qty, standard_output_uom) VALUES
('PF-BAKED_PUMPKIN', 'Baked Pumpkin (Caramelized)', 'dish', 'kg', 1, 'kg'),
('PF-PUMPKIN_COCONUT_BASE', 'Pumpkin Coconut Soup Base', 'dish', 'L', 10, 'L');

-- 3. Ingest BOMs (Proportional)
-- 3.1 Baked Pumpkin (1.25 raw for 1kg baked)
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit)
VALUES (
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-BAKED_PUMPKIN'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-PUMPKIN'),
    1.25
),
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-BAKED_PUMPKIN'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-OLIVE_OIL'),
    0.02 -- Estimation based on "glisten with oil" for 5kg
),
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-BAKED_PUMPKIN'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-FINE_SALT'),
    0.005
);

-- 3.2 Pumpkin Coconut Soup Base (Per 1 Liter)
INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit)
VALUES 
-- Baked Pumpkin (4.5kg / 10L = 0.45)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-BAKED_PUMPKIN'),
    0.45
),
-- Mirepoix Saute (1.2kg / 10L = 0.12)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-MIREPOIX_SAUTE'),
    0.12
),
-- Vegetable Broth (3.5L / 10L = 0.35)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-VEGETABLE_BROTH'),
    0.35
),
-- Coconut Milk (1.2L / 10L = 0.12)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-COCONUT_MILK'),
    0.12
),
-- Ginger (0.1kg / 10L = 0.01)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-FRESH_GINGER'),
    0.01
),
-- Turmeric (0.015kg / 10L = 0.0015)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-TURMERIC_POWDER'),
    0.0015
),
-- Coriander (0.015kg / 10L = 0.0015)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-CORIANDER_POWDER'),
    0.0015
),
-- Sea Salt (0.04kg / 10L = 0.004)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-SEA_SALT'),
    0.004
),
-- Lemon Juice (0.06L / 10L = 0.006)
(
    (SELECT id FROM public.nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE'),
    (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-LEMON_JUICE'),
    0.006
);

-- 4. Update recipes_flow with UUID compliance and new steps
-- [Step logic remains in separate Migration or as part of this if needed]
-- For now, let's just apply the structural changes.
