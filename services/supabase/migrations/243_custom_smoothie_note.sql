-- Migration 243: explainer note for the Custom (build-your-own) smoothie
-- The Custom Smoothie has no fixed BOM; its value is the customisation menu.
-- Set an assembler/customer note describing what makes it custom.

BEGIN;

UPDATE public.nomenclature
SET assembler_note = 'Build your own — base ฿89. Pick up to 4 fruits, choose a liquid base, then add boosters & toppings. Each add-on is priced below.',
    updated_at = now()
WHERE product_code = 'SALE-SMOOTHIE_CUSTOM'
  AND assembler_note IS NULL;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '243_custom_smoothie_note.sql',
  'claude-code',
  'Set explainer assembler_note for SALE-SMOOTHIE_CUSTOM.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
