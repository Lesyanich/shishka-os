-- 138_nomenclature_portion_size.sql
-- Adds serving-size columns to public.nomenclature so the customer menu
-- preview can show "250g" / "300ml" / "1 pc" under each dish card, and so
-- price-per-100g / price-per-100ml can be computed on the fly for SALE items.
--
-- Independent from base_unit (purchase/stock unit). A dish may have
--   base_unit = 'portion',     -- how we count it in inventory/BOM
--   portion_size = 250,         -- one portion weighs …
--   portion_unit = 'g'.         -- … 250 grams.
--
-- Nullable — existing rows are left blank and the CEO fills values from UI.

BEGIN;

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS portion_size NUMERIC
    CHECK (portion_size IS NULL OR portion_size > 0),
  ADD COLUMN IF NOT EXISTS portion_unit TEXT
    CHECK (portion_unit IS NULL OR portion_unit IN ('g', 'ml', 'pcs'));

-- Either both set or both null (no half-filled rows).
ALTER TABLE public.nomenclature
  DROP CONSTRAINT IF EXISTS nomenclature_portion_both_or_neither;
ALTER TABLE public.nomenclature
  ADD CONSTRAINT nomenclature_portion_both_or_neither
    CHECK (
      (portion_size IS NULL AND portion_unit IS NULL)
      OR (portion_size IS NOT NULL AND portion_unit IS NOT NULL)
    );

COMMENT ON COLUMN public.nomenclature.portion_size IS
  'Serving size shown on the menu card. E.g. 250 (with portion_unit=g) means "250 g per portion".';
COMMENT ON COLUMN public.nomenclature.portion_unit IS
  'Unit for portion_size. One of g|ml|pcs. g/ml enable price-per-100 display; pcs shows only price per portion.';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '138_nomenclature_portion_size.sql',
  'claude-code',
  NULL,
  'Add nomenclature.portion_size (NUMERIC) + portion_unit (g|ml|pcs) for customer menu display and price-per-100g calculation. Independent of base_unit; nullable.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
