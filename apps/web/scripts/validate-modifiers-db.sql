-- ============================================================
-- Pre-merge DB validation: modifier chain integrity
-- Run in Supabase Studio → SQL Editor before merging.
-- All numbers in the FAIL column should be 0.
-- ============================================================

WITH

-- 1. menu_modifiers view: reachable, all columns present, no bad data
view_ok AS (
  SELECT
    COUNT(*)                                                         AS total_rows,
    COUNT(DISTINCT dish_id)                                          AS dishes,
    COUNT(CASE WHEN option_name IS NULL OR option_name = '' THEN 1 END) AS blank_names,
    COUNT(CASE WHEN price_delta < 0 THEN 1 END)                     AS negative_delta,
    COUNT(CASE WHEN group_min_select IS NOT NULL
               AND group_max_select IS NOT NULL
               AND group_min_select > group_max_select THEN 1 END)  AS min_gt_max
  FROM public.menu_modifiers
),

-- 2. dish_modifier_groups: all dish_ids and list_ids exist
dmg_ok AS (
  SELECT
    COUNT(*)                                                         AS total,
    COUNT(CASE WHEN n.id IS NULL THEN 1 END)                         AS orphaned_dish,
    COUNT(CASE WHEN l.id IS NULL THEN 1 END)                         AS orphaned_list,
    COUNT(CASE WHEN g.min_select IS NOT NULL
               AND g.max_select IS NOT NULL
               AND g.min_select > g.max_select THEN 1 END)           AS min_gt_max
  FROM public.dish_modifier_groups g
  LEFT JOIN public.nomenclature n ON n.id = g.dish_id
  LEFT JOIN public.pos_loyverse_modifier_lists l ON l.id = g.loyverse_modifier_list_id
),

-- 3. nomenclature_modifier_options: no orphaned refs
nmo_ok AS (
  SELECT
    COUNT(*)                                                         AS total,
    COUNT(CASE WHEN nd.id IS NULL THEN 1 END)                        AS orphaned_dish,
    COUNT(CASE WHEN nm.id IS NULL THEN 1 END)                        AS orphaned_modifier,
    COUNT(CASE WHEN o.price_delta < 0 THEN 1 END)                   AS negative_delta
  FROM public.nomenclature_modifier_options o
  LEFT JOIN public.nomenclature nd ON nd.id = o.dish_id
  LEFT JOIN public.nomenclature nm ON nm.id = o.modifier_id
),

-- 4. Loyverse mirror: all options have a parent list
lv_ok AS (
  SELECT
    COUNT(o.id)                                                      AS total_options,
    COUNT(CASE WHEN l.id IS NULL THEN 1 END)                         AS orphaned_options,
    COUNT(DISTINCT l.id)                                             AS total_lists
  FROM public.pos_loyverse_modifier_options o
  LEFT JOIN public.pos_loyverse_modifier_lists l ON l.id = o.list_id
),

-- 5. Dishes that appear in menu_modifiers must also appear in menu_public
-- (otherwise modifiers would load for a dish the customer can't see)
coverage_ok AS (
  SELECT
    COUNT(DISTINCT mm.dish_id)                                       AS modifier_dishes,
    COUNT(DISTINCT CASE WHEN mp.id IS NULL THEN mm.dish_id END)      AS missing_from_menu
  FROM public.menu_modifiers mm
  LEFT JOIN public.menu_public mp ON mp.id = mm.dish_id
)

SELECT
  check_name,
  info,
  CASE
    WHEN fail_count = 0 THEN '✓ PASS'
    ELSE '✗ FAIL (' || fail_count || ')'
  END AS result
FROM (
  SELECT 'menu_modifiers — total rows'       AS check_name, total_rows::text                     AS info, 0          AS fail_count FROM view_ok
  UNION ALL
  SELECT 'menu_modifiers — dishes with mods', dishes::text,                                       0          FROM view_ok
  UNION ALL
  SELECT 'menu_modifiers — blank option names','should be 0',                                     blank_names  FROM view_ok
  UNION ALL
  SELECT 'menu_modifiers — negative delta',   'should be 0',                                     negative_delta FROM view_ok
  UNION ALL
  SELECT 'menu_modifiers — min>max groups',   'should be 0',                                     min_gt_max    FROM view_ok
  UNION ALL
  SELECT 'dish_modifier_groups — total',      total::text,                                        0             FROM dmg_ok
  UNION ALL
  SELECT 'dish_modifier_groups — orphaned dish','should be 0',                                   orphaned_dish FROM dmg_ok
  UNION ALL
  SELECT 'dish_modifier_groups — orphaned list','should be 0',                                   orphaned_list FROM dmg_ok
  UNION ALL
  SELECT 'dish_modifier_groups — min>max',    'should be 0',                                     min_gt_max    FROM dmg_ok
  UNION ALL
  SELECT 'nmo — total options',               total::text,                                        0             FROM nmo_ok
  UNION ALL
  SELECT 'nmo — orphaned dish ref',           'should be 0',                                     orphaned_dish FROM nmo_ok
  UNION ALL
  SELECT 'nmo — orphaned modifier ref',       'should be 0',                                     orphaned_modifier FROM nmo_ok
  UNION ALL
  SELECT 'nmo — negative price delta',        'should be 0',                                     negative_delta FROM nmo_ok
  UNION ALL
  SELECT 'loyverse — total options',          total_options::text,                                0             FROM lv_ok
  UNION ALL
  SELECT 'loyverse — orphaned options',       'should be 0',                                     orphaned_options FROM lv_ok
  UNION ALL
  SELECT 'loyverse — total lists',            total_lists::text,                                  0             FROM lv_ok
  UNION ALL
  SELECT 'coverage — modifier dishes',        modifier_dishes::text,                              0             FROM coverage_ok
  UNION ALL
  SELECT 'coverage — mods for hidden dish',   'should be 0',                                     missing_from_menu FROM coverage_ok
) checks
ORDER BY check_name;
