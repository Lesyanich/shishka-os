-- Migration 019: Add cost_per_unit and notes to nomenclature
-- Phase 3.6: BOM Hub Editor & Database Sync

ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC DEFAULT 0;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.nomenclature.cost_per_unit IS 'Unit cost in THB for RAW items. For PF/SALE, calculated from BOM.';
COMMENT ON COLUMN public.nomenclature.notes IS 'Free-text notes for the item.';
