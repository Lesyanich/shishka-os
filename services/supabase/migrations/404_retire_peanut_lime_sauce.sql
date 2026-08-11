-- 404_retire_peanut_lime_sauce.sql
-- CEO decision 2026-08-11: "no SALE-SAUCE_PEANUT".
--
-- WHY NOW. Task 3a11032b removed the false peanut from the 4 spring rolls back in
-- July and deliberately left the sauce itself alive, on the reasoning recorded in
-- its own comment: "is_web_visible=false, pos_status=draft, so PF-SAUCE_PEANUT_LIME
-- stays alive only as a non-public draft. Nothing peanut reaches the guest."
--
-- That is no longer true. The sauce has since been pushed to the till:
--   pos_status = 'synced', loyverse_item_id = 0e4c266a-3ad7-4f23-8af0-3fea3b7c8528,
--   price 39 THB.
-- So it is orderable at the counter while the website offers mango instead. It is
-- also the single reason the kitchen's "no seed oil" claim has an exception —
-- RAW-OIL-SESAME reaches exactly one BOM, PF-SAUCE_PEANUT_LIME, and nothing else.
--
-- ARCHIVE, NOT DELETE — same convention as 403_retire_shrimp_taco.sql and
-- SALE-MANAISH_LIONS_MANE_GF: name prefixed [ARCHIVED], pos_status draft,
-- is_available/is_web_visible false, is_deleted stays false. BOM, price, recipe
-- and photo are left intact so the DOWN block revives it exactly.
--
-- loyverse_item_id is deliberately NOT cleared here. The POS item is removed by a
-- separate `delete` row in loyverse_push_queue, and that worker needs the id to
-- know what to delete. Clearing it first would orphan a live till item forever.
--
-- SCOPE CHECKED BEFORE WRITING (all asserted again below):
--   * no dish consumes SALE-SAUCE_PEANUT — it is a standalone sauce cup
--   * not attached to any dish via nomenclature_modifier_options (free-sauce pool)
--   * the Loyverse "Peanut Butter" 30 THB option in "Nuts, Seeds & Butters" is a
--     different product (a nut butter add-on) and is untouched

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard: refuse if anything still depends on either SKU.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_consumers int;
  v_modifiers int;
BEGIN
  SELECT count(*) INTO v_consumers
  FROM bom_structures b
  JOIN nomenclature i ON i.id = b.ingredient_id
  JOIN nomenclature p ON p.id = b.parent_id
  WHERE i.product_code = 'SALE-SAUCE_PEANUT'
     OR (i.product_code = 'PF-SAUCE_PEANUT_LIME'
         AND p.product_code <> 'SALE-SAUCE_PEANUT');
  IF v_consumers > 0 THEN
    RAISE EXCEPTION 'Refusing to retire: % BOM line(s) still consume the peanut sauce', v_consumers;
  END IF;

  SELECT count(*) INTO v_modifiers
  FROM nomenclature_modifier_options o
  JOIN nomenclature m ON m.id = o.modifier_id
  WHERE m.product_code IN ('SALE-SAUCE_PEANUT','PF-SAUCE_PEANUT_LIME');
  IF v_modifiers > 0 THEN
    RAISE EXCEPTION 'Refusing to retire: still attached as a modifier option on % dish(es)', v_modifiers;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Archive both SKUs.
-- ---------------------------------------------------------------------------
UPDATE nomenclature
SET name           = '[ARCHIVED] ' || name,
    pos_status     = 'draft',
    is_available   = false,
    is_web_visible = false,
    updated_at     = now()
WHERE product_code = 'SALE-SAUCE_PEANUT'
  AND name NOT LIKE '[ARCHIVED]%';

UPDATE nomenclature
SET name         = '[ARCHIVED] ' || name,
    is_available = false,
    updated_at   = now()
WHERE product_code = 'PF-SAUCE_PEANUT_LIME'
  AND name NOT LIKE '[ARCHIVED]%';

-- ---------------------------------------------------------------------------
-- Verify: sesame oil no longer reaches anything sellable, and neither SKU is live.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sesame int;
  v_live   int;
BEGIN
  SELECT count(*) INTO v_sesame
  FROM bom_structures b
  JOIN nomenclature i ON i.id = b.ingredient_id
  JOIN nomenclature p ON p.id = b.parent_id
  WHERE i.product_code = 'RAW-OIL-SESAME'
    AND p.is_deleted = false
    AND p.is_available = true
    AND p.name NOT LIKE '[ARCHIVED]%';
  IF v_sesame > 0 THEN
    RAISE EXCEPTION 'Sesame oil still reaches % live product(s) — "no seed oil" would remain false', v_sesame;
  END IF;

  SELECT count(*) INTO v_live
  FROM nomenclature
  WHERE product_code IN ('SALE-SAUCE_PEANUT','PF-SAUCE_PEANUT_LIME')
    AND (is_available = true OR is_web_visible = true);
  IF v_live > 0 THEN
    RAISE EXCEPTION 'Peanut sauce still flagged live after archive (% row(s))', v_live;
  END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('404_retire_peanut_lime_sauce.sql', 'claude-opus-session-2c0bc6', 'success',
        'CEO 2026-08-11 "no SALE-SAUCE_PEANUT". Archived SALE-SAUCE_PEANUT + PF-SAUCE_PEANUT_LIME '
     || '(name [ARCHIVED], pos_status draft, is_available/is_web_visible false, is_deleted left false) '
     || 'per the 403_retire_shrimp_taco convention. Task 3a11032b had left this sauce alive on the '
     || 'reasoning that it was a non-public draft; it had since drifted to pos_status=synced with a '
     || 'live Loyverse id at 39 THB, so it was orderable at the counter while the site offered mango. '
     || 'Nothing consumed it: no BOM parent, no modifier-option attachment. Retiring it also empties '
     || 'the last BOM referencing RAW-OIL-SESAME, which is what made the kitchen "no seed oil" claim '
     || 'conditional — asserted in this migration. loyverse_item_id deliberately preserved so the '
     || 'companion loyverse_push_queue delete row can remove the till item; the POS half is NOT done '
     || 'by this migration.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- UPDATE nomenclature
-- SET name = regexp_replace(name, '^\[ARCHIVED\] ', ''),
--     pos_status = 'synced', is_available = true, updated_at = now()
-- WHERE product_code = 'SALE-SAUCE_PEANUT';
-- UPDATE nomenclature
-- SET name = regexp_replace(name, '^\[ARCHIVED\] ', ''),
--     is_available = true, updated_at = now()
-- WHERE product_code = 'PF-SAUCE_PEANUT_LIME';
-- -- NOTE: if the POS delete already ran, loyverse_item_id is gone and the item
-- -- must be re-pushed with a fresh `dish` row in loyverse_push_queue.
-- DELETE FROM public.migration_log WHERE filename='404_retire_peanut_lime_sauce.sql';
-- COMMIT;
