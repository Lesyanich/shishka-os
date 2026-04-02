-- Migration 005: Unified Nomenclature Table
-- Goal: Merge products and nomenclature_sync into a single UUID-compliant table.

-- 1. Create the unified table
CREATE TABLE public.nomenclature (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code TEXT UNIQUE NOT NULL,
    syrve_id UUID UNIQUE,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('good', 'dish', 'modifier', 'modifier_group', 'service')),
    category TEXT,
    base_unit TEXT,
    standard_output_qty NUMERIC,
    standard_output_uom TEXT,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Migrate data from nomenclature_sync (primary source for SYRVE tracking)
INSERT INTO public.nomenclature (product_code, syrve_id, name, type, base_unit)
SELECT product_code, syrve_system_id, name, type, measure_unit
FROM public.nomenclature_sync;

-- 3. Sync additional data from products (standard output weights)
UPDATE public.nomenclature n
SET standard_output_qty = p.standard_output_amount,
    standard_output_uom = p.standard_output_uom
FROM public.products p
WHERE n.product_code = p.code;

-- 4. Audit Log
COMMENT ON TABLE public.nomenclature IS 'Unified SYRVE-mapped nomenclature. Multi-agent P0 source of truth.';
