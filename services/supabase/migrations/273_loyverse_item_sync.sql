-- Migration 273: loyverse_item_sync
-- Stores a snapshot of item data pulled from Loyverse API.
-- Allows the admin UI to show sync gaps (no photo, price mismatch, etc.)
-- without hammering the Loyverse API on every page load.

CREATE TABLE IF NOT EXISTS loyverse_item_sync (
  loyverse_item_id  text        PRIMARY KEY,
  nomenclature_id   uuid        REFERENCES nomenclature(id) ON DELETE SET NULL,
  lv_name           text,
  lv_price          numeric(10,2),      -- first variant default_price
  lv_image_url      text,               -- null = no photo set in Loyverse
  lv_category_id    text,
  lv_is_deleted     boolean     NOT NULL DEFAULT false,
  pulled_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyverse_item_sync_nomenclature ON loyverse_item_sync(nomenclature_id);

-- View: joined status for every SALE-* item
-- Computes lv_status, lv_has_photo, has_our_photo, price_mismatch in one place.
CREATE OR REPLACE VIEW v_loyverse_sync_status AS
SELECT
  n.id                AS nomenclature_id,
  n.product_code,
  n.name,
  n.price             AS our_price,
  n.image_url         AS our_image_url,
  n.loyverse_item_id,

  s.lv_name,
  s.lv_price,
  s.lv_image_url,
  s.lv_is_deleted,
  s.pulled_at,

  CASE
    WHEN n.loyverse_item_id IS NULL              THEN 'not_in_lv'
    WHEN s.loyverse_item_id IS NULL              THEN 'not_pulled'
    WHEN s.lv_is_deleted                         THEN 'deleted_in_lv'
    ELSE                                              'ok'
  END AS lv_status,

  (s.lv_image_url IS NOT NULL AND s.lv_image_url <> '') AS lv_has_photo,
  (n.image_url    IS NOT NULL AND n.image_url    <> '') AS has_our_photo,

  (
    s.lv_price IS NOT NULL
    AND n.price IS NOT NULL
    AND abs(s.lv_price - n.price) > 0.5
  ) AS price_mismatch

FROM nomenclature n
LEFT JOIN loyverse_item_sync s ON s.loyverse_item_id = n.loyverse_item_id
WHERE n.product_code LIKE 'SALE-%'
ORDER BY n.name;

INSERT INTO migration_log (migration_id, description)
VALUES (273, 'loyverse_item_sync table + v_loyverse_sync_status view')
ON CONFLICT (migration_id) DO NOTHING;
