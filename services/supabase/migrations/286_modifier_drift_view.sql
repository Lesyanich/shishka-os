-- 286_modifier_drift_view.sql
-- Phase 2 of "DB is the source of truth, Loyverse is derived".
--
-- Divergence tracking for menu modifiers (CEO: "расхождения обязательно трекать").
-- Mirrors the spirit of loyverse_item_sync / v_loyverse_sync_status (photos/prices),
-- but for modifier options.
--
-- v_modifier_drift compares the DB web-config (nomenclature_modifier_options =
-- source of truth) against the Loyverse mirror (dish_modifier_groups +
-- pos_loyverse_modifier_options) per (dish, Loyverse option) and reports only
-- the rows that DON'T match:
--   * price_mismatch  — option exists both sides, price_delta != Loyverse price
--   * missing_in_db   — Loyverse offers it on this dish, DB-truth has no row yet
--   * missing_in_pos  — DB has a row whose loyverse option id is gone / group not attached
--
-- A dish/category with zero rows here = fully reconciled. After mig 285 the
-- coffee category (KP-DRK-COF) should be clean; other categories will still show
-- drift until they are migrated too.

BEGIN;

CREATE OR REPLACE VIEW v_modifier_drift AS
SELECT * FROM (
  WITH pos_side AS (
    SELECT g.dish_id,
           o.id::text  AS loyverse_option_id,
           ml.name      AS list_name,
           o.name       AS option_name,
           o.price      AS pos_price
    FROM dish_modifier_groups g
    JOIN pos_loyverse_modifier_lists   ml ON ml.id = g.loyverse_modifier_list_id
    JOIN pos_loyverse_modifier_options o  ON o.list_id = ml.id
  ),
  db_side AS (
    SELECT o.dish_id,
           o.loyverse_modifier_id        AS loyverse_option_id,
           o.loyverse_modifier_list_name AS list_name,
           o.price_delta                 AS db_price,
           o.modifier_id
    FROM nomenclature_modifier_options o
    WHERE o.loyverse_modifier_id IS NOT NULL
  )
  SELECT
    COALESCE(p.dish_id, d.dish_id)        AS dish_id,
    n.name                                AS dish,
    n.product_code,
    c.code                                AS category_code,
    COALESCE(p.list_name, d.list_name)    AS group_name,
    COALESCE(p.option_name, m.name)       AS option_name,
    d.db_price,
    p.pos_price,
    CASE
      WHEN d.loyverse_option_id IS NULL THEN 'missing_in_db'
      WHEN p.loyverse_option_id IS NULL THEN 'missing_in_pos'
      WHEN d.db_price <> p.pos_price     THEN 'price_mismatch'
      ELSE 'ok'
    END                                   AS drift_type
  FROM pos_side p
  FULL OUTER JOIN db_side d
    ON d.dish_id = p.dish_id
   AND d.loyverse_option_id = p.loyverse_option_id
  JOIN nomenclature n       ON n.id = COALESCE(p.dish_id, d.dish_id)
  JOIN product_categories c ON c.id = n.category_id
  LEFT JOIN nomenclature m  ON m.id = d.modifier_id
  WHERE n.product_code LIKE 'SALE-%'
    AND n.is_available = true   -- monitor live menu only; retired dishes' stale POS attachments are not "drift"
) z
WHERE z.drift_type <> 'ok';

COMMENT ON VIEW v_modifier_drift IS
  'Phase 2 modifier divergence tracker: rows where DB web-config (source of truth) != Loyverse mirror. drift_type in (price_mismatch, missing_in_db, missing_in_pos). Empty for a dish = reconciled.';

INSERT INTO migration_log (filename, applied_by, status)
VALUES ('286_modifier_drift_view.sql', 'manual', 'success')
ON CONFLICT DO NOTHING;

COMMIT;
