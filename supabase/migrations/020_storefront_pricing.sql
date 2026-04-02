-- ============================================================
-- Migration 020: Storefront Extension & Pricing Engine
-- Phase 1.5: Site display, КБЖУ nutrition, markup economics
-- ============================================================

-- ─── SITE / DISPLAY ───────────────────────────────────────────

ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS price         NUMERIC;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS image_url     TEXT;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS slug          TEXT UNIQUE;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS is_available  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS is_featured   BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_nomenclature_slug       ON public.nomenclature (slug)         WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nomenclature_available   ON public.nomenclature (is_available)  WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_nomenclature_featured    ON public.nomenclature (is_featured)   WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_nomenclature_display     ON public.nomenclature (display_order);

-- ─── NUTRITION (КБЖУ) ─────────────────────────────────────────

ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS calories  INTEGER;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS protein   NUMERIC;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS carbs     NUMERIC;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS fat       NUMERIC;
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS allergens TEXT[];

-- ─── ECONOMICS ────────────────────────────────────────────────

ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS markup_pct NUMERIC NOT NULL DEFAULT 0;

-- ─── COMMENTS ─────────────────────────────────────────────────

COMMENT ON COLUMN public.nomenclature.price         IS 'Final selling price in THB. May differ from cost*(1+markup/100).';
COMMENT ON COLUMN public.nomenclature.slug          IS 'URL-safe identifier for storefront routes. Auto-generated from name if blank.';
COMMENT ON COLUMN public.nomenclature.is_available   IS 'Whether item shows on the storefront.';
COMMENT ON COLUMN public.nomenclature.is_featured    IS 'Featured items appear in hero section.';
COMMENT ON COLUMN public.nomenclature.display_order  IS 'Sort order on storefront (lower = higher).';
COMMENT ON COLUMN public.nomenclature.calories       IS 'kcal per portion.';
COMMENT ON COLUMN public.nomenclature.protein        IS 'Grams of protein per portion.';
COMMENT ON COLUMN public.nomenclature.carbs          IS 'Grams of carbohydrates per portion.';
COMMENT ON COLUMN public.nomenclature.fat            IS 'Grams of fat per portion.';
COMMENT ON COLUMN public.nomenclature.allergens      IS 'Array of allergen tags, e.g. {gluten,dairy,nuts}.';
COMMENT ON COLUMN public.nomenclature.markup_pct     IS 'Target markup percentage. Recommended price = cost*(1+markup/100).';
