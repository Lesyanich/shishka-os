# Menu Data Surfaces — how chef data renders in the admin `/menu` UI

> Load this whenever a task builds a recipe / production flow / PF prep.
> The `/menu` page ALREADY renders rich tech cards from chef data. Populate the
> STRUCTURED fields (not just text), or the cards stay half-empty.

## ⏩ Discover this with graphify FIRST (GRAPH-BEFORE-GREP)
Before assuming a frontend / feature / wiring does NOT exist, ask the graph — don't read files blind:
`graphify_query_topic("menu L1 cook recipe flow steps")` instantly returns `component_l1_cook_tab`
(→ `pf_pack_card`, `dish_card`, `dish_drawer`), `table_recipes_flow`, the `manage-recipe-flow.ts`
MCP tool, and the design plans (`recipe-card-redesign.md`, `menu-card-data-layer.md`).
This whole gap happened because the chef read files blind instead of querying graphify.

## Views
`apps/admin-panel/src/pages/menu/MenuPage.tsx` → `/menu?view=` = **owner | l1-cook | l2-assembler | customer**. Same 4 as the dish-drawer tabs (`DishDrawer.tsx`).

## L1 Cook tab renders, FROM DATA (`L1CookTab.tsx` + `useDishRecipeSteps` + `usePfPackCard`)
- **Summary bar:** total / active / passive time + CCP count (computed from steps)
- **Ingredients:** from `bom_structures`
- **Process steps:** from `recipes_flow` — each card shows `step_order`, `operation_name`,
  `duration_min`, `instruction_text`, **`temperature_c` (🔥 equip)**, **`internal_temp_c` (🌡️ probe)**,
  **`is_ccp` (amber CCP badge) + `ccp_check_text`**, **`is_passive`**, `equipment(name,category)`, `notes`
- **Storage & label (PF only):** from table **`pf_pack_card`** (key = `nomenclature_id`):
  `shelf_life_days`, `storage_temp_min_c` / `storage_temp_max_c`, `vacuum_bag_size`,
  `portions_per_bag`, `portion_weight_g`, `storage_zone`, `label_template {fields[]}`
- **PrepLabelBlock (PF):** shelf-life editor + RawBT label print

## Station model
`recipes_flow.location_id` → `locations`: **Kitchen + Storage = L1**, **Assembly = L2**.
(Today L1 Cook shows ALL steps; the L2 Assembler tab shows assembler note + photo, not a
per-station step split. Splitting L2 steps out is a small frontend change.)

## ⚠️ TOOLING GAP — read this before building a flow
The `shishka-chef` MCP `manage_recipe_flow` only writes `operation_name / duration_min /
instruction_text / equipment_id / notes`. It does **NOT** set `temperature_c`,
`internal_temp_c`, `is_ccp`, `ccp_check_text`, `location_id` — and there is **NO tool for
`pf_pack_card`**. Until the MCP is extended (tracked in MC), set those fields via
`execute_sql` AFTER creating the flow, or the L1 Cook cards render half-empty.
