-- 418_set_sauce_photos_from_provided_images.sql
--
-- Set image_url for the 6 core sauces to the exact product shots the CEO
-- provided (files: Daynamite-Sauce.png, Honey-Musterd-Sauce.png, Mayo-Sauce.png,
-- Pomegranate-Molasses Dressing.png, Truffel-sauce.png, tahini vinaigrette.png
-- — matched to product_code via migration 405's naming). Uploaded to the
-- nomenclature-photos bucket, one object per dish id.
--
-- CONTRACT-REVIEWED: safe. Updates nomenclature.image_url only — no schema
-- change, no row count change. menu_public already selects image_url.

BEGIN;

UPDATE nomenclature SET image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/cac858b3-07c0-4a3a-bfd0-38c22cdf16c8/menu-sauce-1791124331.webp?v=1791124331'
WHERE product_code = 'SALE-SAUCE_HUMMUS'; -- Daynamite Sauce

UPDATE nomenclature SET image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/d1a0f372-4bc2-4348-9734-3c15e64187ec/menu-sauce-1791124331.webp?v=1791124331'
WHERE product_code = 'SALE-SAUCE_YOGURT_TAHINI'; -- Honey-Mustard Sauce

UPDATE nomenclature SET image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/c7bf2b5b-9bf1-4471-9d51-9402764ee260/menu-sauce-1791124331.webp?v=1791124331'
WHERE product_code = 'SALE-SAUCE_LEMON_OLIVE'; -- Mayo Sauce

UPDATE nomenclature SET image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/66978db0-44d3-4121-9505-314feaa7d070/menu-sauce-1791124331.webp?v=1791124331'
WHERE product_code = 'SALE-SAUCE_POMEGRANATE'; -- Pomegranate Molasses

UPDATE nomenclature SET image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/d2025054-e4e8-40a3-937f-ca4d1e2cb2a6/menu-sauce-1791124331.webp?v=1791124331'
WHERE product_code = 'SALE-SAUCE_MUSHROOM_TRUFFLE'; -- Truffle Sauce

UPDATE nomenclature SET image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/de8ad210-6f05-48df-b8a1-c4ce85177a2f/menu-sauce-1791124331.webp?v=1791124331'
WHERE product_code = 'SALE-SAUCE_TAHINI_TAMARIND'; -- Tahini Vinaigrette

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '418_set_sauce_photos_from_provided_images.sql',
  'claude-code',
  NULL,
  'Set image_url for the 6 core sauces to the user-provided product shots (Daynamite, Honey-Mustard, Mayo, Pomegranate Molasses, Truffle, Tahini Vinaigrette), uploaded to nomenclature-photos bucket'
)
ON CONFLICT DO NOTHING;

COMMIT;
