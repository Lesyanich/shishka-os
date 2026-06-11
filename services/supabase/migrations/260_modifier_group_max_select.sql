-- Add max_select to dish_modifier_groups (symmetric to min_select, mig 259) so
-- a "build your own" group can cap how many options a guest picks. Cap the
-- Custom Smoothie "Pick Fruits" group at 4, and expose group_max_select on the
-- customer menu_modifiers view so shishka.health can enforce the maximum in the
-- ModifierBuilder (e.g. "pick 2–4").

ALTER TABLE public.dish_modifier_groups
  ADD COLUMN IF NOT EXISTS max_select integer;

-- Cap Pick Fruits at 4 for the Custom Smoothie. Targeted by product_code + list
-- name (no hardcoded UUID) so the migration is portable/re-runnable.
UPDATE public.dish_modifier_groups g
SET max_select = 4
FROM public.nomenclature n, public.pos_loyverse_modifier_lists l
WHERE g.dish_id = n.id
  AND g.loyverse_modifier_list_id = l.id
  AND n.product_code = 'SALE-SMOOTHIE_CUSTOM'
  AND l.name = 'Pick Fruits';

-- Append group_max_select to the view. CREATE OR REPLACE can't insert a column
-- mid-list, so it goes at the very end (after group_min_select from mig 259).
CREATE OR REPLACE VIEW public.menu_modifiers AS
 SELECT o.dish_id,
    o.loyverse_modifier_list_name AS group_name,
    g.sort_order AS group_sort,
    COALESCE(m.customer_short_name, m.name) AS option_name,
    m.emoji AS option_emoji,
    o.price_delta,
    o.is_default,
    o.sort_order,
    m.stock_state AS option_stock_state,
    g.min_select AS group_min_select,
    g.max_select AS group_max_select
   FROM nomenclature_modifier_options o
     JOIN nomenclature m ON m.id = o.modifier_id
     LEFT JOIN dish_modifier_groups g ON g.dish_id = o.dish_id AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  WHERE (o.dish_id IN ( SELECT nomenclature.id
           FROM nomenclature
          WHERE nomenclature.product_code ~~ 'SALE-%'::text AND nomenclature.pos_status = 'synced'::pos_status_enum AND nomenclature.is_available = true));

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '260_modifier_group_max_select.sql',
  'claude-code',
  'Add dish_modifier_groups.max_select; cap Custom Smoothie Pick Fruits at 4; expose group_max_select on menu_modifiers for builder enforcement on shishka.health.'
) ON CONFLICT (filename) DO NOTHING;
