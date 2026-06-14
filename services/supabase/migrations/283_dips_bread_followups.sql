-- ═══════════════════════════════════════════════════════════
-- 283_dips_bread_followups.sql
--
-- Owner follow-ups after migs 280/281:
--
--   1. Restore the standalone Bread & Crackers SKUs to the website. Mig 280
--      hid SALE-MINI_BUNS and SALE-SEED_CRACKERS thinking they were only dip
--      add-ons, but they are also sold on their own in the "🥖 Bread &
--      Crackers" section. Un-hide them. (The dip "Served with bread" add-on
--      uses the separate MOD-* options, so this does not double them up.)
--      The three collapsed VARIANT dishes (HUMMUS_BUNS/_CRACKERS,
--      MUHAMMARA_BUNS) stay hidden — those really are replaced by the add-on.
--
--   2. Beetroot Hummus should also be "served with a bun by default" (฿149),
--      same as plain Hummus / Muhammara — it currently shows the bare ฿111.
--      Give it the same required single-choice "Served with bread" group.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. Bring the standalone buns + crackers back to the Bread & Crackers section.
UPDATE nomenclature
SET is_web_visible = true, is_available = true
WHERE product_code IN ('SALE-MINI_BUNS', 'SALE-SEED_CRACKERS');

-- 2. "Served with bread" single-choice group for Beetroot Hummus (default bun).
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, quantity_per_unit, price_delta, is_default, sort_order,
   loyverse_modifier_list_name, loyverse_modifier_list_id)
SELECT d.id, m.id, 1,
       CASE m.product_code WHEN 'MOD-MINI_BUNS' THEN 38
                           WHEN 'MOD-SEED_CRACKERS' THEN 78
                           ELSE 0 END,
       (m.product_code = 'MOD-MINI_BUNS'),
       CASE m.product_code WHEN 'MOD-MINI_BUNS' THEN 1
                           WHEN 'MOD-SEED_CRACKERS' THEN 2
                           ELSE 3 END,
       'Served with bread', 'WEB-DIP-BREAD'
FROM nomenclature d
JOIN nomenclature m ON m.product_code IN ('MOD-MINI_BUNS', 'MOD-SEED_CRACKERS', 'MOD-NO_BREAD')
WHERE d.product_code = 'SALE-HUMMUS_BEETROOT'
  AND NOT EXISTS (
    SELECT 1 FROM nomenclature_modifier_options o
    WHERE o.dish_id = d.id AND o.modifier_id = m.id
  );

INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT d.id, 'WEB-DIP-BREAD', 0, 1, 1
FROM nomenclature d
WHERE d.product_code = 'SALE-HUMMUS_BEETROOT'
ON CONFLICT (dish_id, loyverse_modifier_list_id)
DO UPDATE SET min_select = 1, max_select = 1, sort_order = 0;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '283_dips_bread_followups.sql',
  'claude-code',
  'Restore standalone SALE-MINI_BUNS/SALE-SEED_CRACKERS to Bread & Crackers; add default-bun "Served with bread" group to Beetroot Hummus.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
