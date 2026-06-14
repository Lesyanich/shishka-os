-- ═══════════════════════════════════════════════════════════
-- 281_dip_bread_choice_default_bun.sql
--
-- Refine the dip "Served with" add-on (mig 280) into the model the owner
-- asked for: the dip is served WITH A BUN BY DEFAULT, and inside the card the
-- guest makes a single choice —
--     • Sourdough Mini Buns  (default, included)   → ฿149
--     • Seed Crackers        (swap, +฿40 vs bun)   → ฿189
--     • No bread / just the dip (−฿38 vs bun)      → ฿111
--
-- Implementation:
--   * Group "Served with bread" becomes a REQUIRED SINGLE choice
--     (min_select = 1, max_select = 1) with Mini Buns as is_default. The
--     website renders it as a radio and shows each option's price RELATIVE to
--     the current pick (so crackers read "+฿40", no-bread "−฿38").
--   * Underlying deltas stay absolute & non-negative (buns +38, crackers +78,
--     no-bread 0) on top of the ฿111 base — the card/dialog show the default
--     (base + default deltas = ฿149).
--   * A new MOD-NO_BREAD zero option gives the radio its "plain" branch.
--
-- Durability: dish_modifier_groups is normally rebuilt from Loyverse by
-- fn_refresh_dish_modifier_groups, which DELETEs groups not present in the POS
-- pull. We (a) tag this group with a sentinel web-only list id 'WEB-DIP-BREAD'
-- (no FK on the column) and (b) patch that function to only delete groups that
-- correspond to a REAL Loyverse list (present in pos_loyverse_modifier_lists),
-- leaving web-only groups untouched. The nightly loyverse-pull cron (action=all)
-- never calls this function anyway — only a manual loyverse-sync modifiers_pull
-- does — but this makes web-only groups durable regardless.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. "No bread" zero-option product (the radio's plain branch). Guarded table
--    requires MOD-* for modifier_id.
INSERT INTO nomenclature
  (product_code, name, customer_short_name, type, base_unit, is_available,
   calories, protein, carbs, fat)
VALUES
  ('MOD-NO_BREAD', 'No bread (just the dip)', 'No bread',
     'modifier', 'pcs', true, 0, 0, 0, 0)
ON CONFLICT (product_code) DO NOTHING;

-- 2. Re-tag the existing buns/crackers options into the single-choice group and
--    set Mini Buns as the default.
UPDATE nomenclature_modifier_options o
SET loyverse_modifier_list_id   = 'WEB-DIP-BREAD',
    loyverse_modifier_list_name = 'Served with bread',
    is_default = (m.product_code = 'MOD-MINI_BUNS'),
    sort_order = CASE m.product_code
                   WHEN 'MOD-MINI_BUNS' THEN 1
                   WHEN 'MOD-SEED_CRACKERS' THEN 2
                   ELSE 3 END
FROM nomenclature m, nomenclature d
WHERE o.modifier_id = m.id
  AND o.dish_id = d.id
  AND d.product_code IN ('SALE-HUMMUS_PLAIN', 'SALE-MUHAMMARA')
  AND m.product_code IN ('MOD-MINI_BUNS', 'MOD-SEED_CRACKERS');

-- 3. Add the "No bread" option to each dip.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, quantity_per_unit, price_delta, is_default, sort_order,
   loyverse_modifier_list_name, loyverse_modifier_list_id)
SELECT d.id, nb.id, 1, 0, false, 3, 'Served with bread', 'WEB-DIP-BREAD'
FROM nomenclature d, nomenclature nb
WHERE d.product_code IN ('SALE-HUMMUS_PLAIN', 'SALE-MUHAMMARA')
  AND nb.product_code = 'MOD-NO_BREAD'
  AND NOT EXISTS (
    SELECT 1 FROM nomenclature_modifier_options o
    WHERE o.dish_id = d.id AND o.modifier_id = nb.id
  );

-- 4. Durable required single-select group (min 1 / max 1).
INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order, min_select, max_select)
SELECT d.id, 'WEB-DIP-BREAD', 0, 1, 1
FROM nomenclature d
WHERE d.product_code IN ('SALE-HUMMUS_PLAIN', 'SALE-MUHAMMARA')
ON CONFLICT (dish_id, loyverse_modifier_list_id)
DO UPDATE SET min_select = 1, max_select = 1, sort_order = 0;

-- 5. Protect web-only modifier groups from the Loyverse refresh: only delete
--    groups that map to a REAL Loyverse list (present in the mirror) and are no
--    longer attached. Web-only sentinel lists are never in the mirror, so they
--    survive. (Only change vs the original is the added EXISTS guard in `del`.)
CREATE OR REPLACE FUNCTION public.fn_refresh_dish_modifier_groups(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_synced INT := 0;
BEGIN
  WITH payload AS (
    SELECT
      (e->>'item_id')              AS loyverse_item_id,
      jsonb_array_elements_text(COALESCE(e->'modifier_list_ids','[]'::jsonb)) AS list_id
    FROM jsonb_array_elements(p_items) AS e
  ),
  resolved AS (
    SELECT DISTINCT n.id AS dish_id, p.list_id
    FROM payload p
    JOIN nomenclature n ON n.loyverse_item_id = p.loyverse_item_id AND n.product_code LIKE 'SALE-%'
    JOIN pos_loyverse_modifier_lists pml ON pml.id = p.list_id
  ),
  touched_dishes AS (
    SELECT DISTINCT n.id AS dish_id
    FROM payload p
    JOIN nomenclature n ON n.loyverse_item_id = p.loyverse_item_id AND n.product_code LIKE 'SALE-%'
  ),
  del AS (
    DELETE FROM dish_modifier_groups dmg
    WHERE dmg.dish_id IN (SELECT dish_id FROM touched_dishes)
      -- only Loyverse-backed groups are managed by this refresh; leave
      -- web-only groups (sentinel list ids) alone
      AND EXISTS (
        SELECT 1 FROM pos_loyverse_modifier_lists pml
        WHERE pml.id = dmg.loyverse_modifier_list_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM resolved r
        WHERE r.dish_id = dmg.dish_id AND r.list_id = dmg.loyverse_modifier_list_id
      )
    RETURNING 1
  ),
  ins AS (
    INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id)
    SELECT dish_id, list_id FROM resolved
    ON CONFLICT (dish_id, loyverse_modifier_list_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM resolved) INTO v_synced;
  RETURN v_synced;
END;
$function$;

-- 6. Remove Pesto Hummus + Guacamole from the site for now (owner: make
--    inactive). POS rows stay; just off the website.
UPDATE nomenclature
SET is_web_visible = false, is_available = false
WHERE product_code IN ('SALE-HUMMUS_PESTO', 'SALE-GUACAMOLE');

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '281_dip_bread_choice_default_bun.sql',
  'claude-code',
  'Dip "Served with bread" = required single choice, default Mini Buns (฿149); Seed Crackers swap (+฿40), No bread (−฿38). Web-only durable group + fn_refresh guard. Hide Pesto Hummus + Guacamole.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
