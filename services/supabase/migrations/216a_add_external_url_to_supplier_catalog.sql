-- ═══════════════════════════════════════════════════════════════
-- Migration 214: Add external_url to supplier_catalog
-- Stores direct link to product page at supplier website
-- (e.g. https://www.makro.pro/product/...)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.supplier_catalog
  ADD COLUMN IF NOT EXISTS external_url TEXT;

COMMENT ON COLUMN public.supplier_catalog.external_url
  IS 'Direct link to product page at supplier website (e.g. https://www.makro.pro/product/...)';

CREATE INDEX idx_sc_external_url ON public.supplier_catalog(external_url)
  WHERE external_url IS NOT NULL;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '216a_add_external_url_to_supplier_catalog.sql',
    'claude-code',
    'Add external_url column to supplier_catalog for direct product page links (e.g. makro.pro).'
) ON CONFLICT (filename) DO NOTHING;
