-- 408_add_section_hero_images.sql
--
-- Add hero image support to product_categories for section hero images
-- on shishka.health (Wraps, Bowls, All Day Breakfast)

BEGIN;

ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS hero_image_alt TEXT;

COMMENT ON COLUMN product_categories.hero_image_url IS 'Large hero image URL to display on website section';
COMMENT ON COLUMN product_categories.hero_image_alt IS 'Alt text for hero image';

-- Grant read access to anon and authenticated users
GRANT SELECT (id, code, name, hero_image_url, hero_image_alt) ON product_categories TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '408_add_section_hero_images.sql',
  'claude-code',
  NULL,
  'Add hero_image_url and hero_image_alt columns to product_categories for section hero images'
)
ON CONFLICT DO NOTHING;

COMMIT;
