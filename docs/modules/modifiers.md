# Module: Modifiers — 2-Level Loyverse-Synced Architecture (PLAN)

Status: **PLAN / not yet implemented** (2026-06-02). Current production state is the
interim per-dish flat-binding model (see "Current state" below). This document is the
target architecture the CEO approved: a 2-level model, fully synchronized with Loyverse.

---

## Why

Loyverse models modifiers as **2 levels**: a *group* (modifier list, with `min_select` /
`max_select` selection rules and `stores` availability) containing *options* (name + price).
This is the right model. Our admin should mirror it 1:1 so a single `pull` keeps us fully
synced, while we add the one thing Loyverse cannot hold: **food-cost** (option → real
ingredient/nomenclature + portion).

## Current state (interim, shipped 2026-06-02)

- **Mirror (raw, read-only):** `pos_loyverse_modifier_lists` (groups) + `pos_loyverse_modifier_options` (options). Refreshed by `loyverse-sync ?action=pull_modifiers`. Already a faithful 2-level copy (incl. price, stores; `min/max_select` columns exist but arrive null today).
- **Bindings (interim):** `nomenclature_modifier_options` — flat, one row per (dish, MOD-*), carrying `loyverse_modifier_id` + `loyverse_modifier_list_id/name`, `quantity_per_unit`, `price_delta`, `slot`. Consumed per-dish by `useModifierOptions(dishId)`.
- Smoothies fully mapped (181 rows). Salads deferred.
- **Smell:** the flat table denormalizes "dish → group attachment" × "options in group". Group attachment is re-derived on the fly from Loyverse `item.modifier_ids` (`?action=item_modifiers`). There is no clean dish→group table.

## Target architecture

Source-of-truth split:

| Concern | SSoT | Storage |
|---|---|---|
| Groups: name, min/max_select, stores, position | **Loyverse** | `pos_loyverse_modifier_lists` (mirror) |
| Options: name, price, position | **Loyverse** | `pos_loyverse_modifier_options` (mirror) |
| Dish → group attachment | **Loyverse** (`item.modifier_ids`) | **NEW** `dish_modifier_groups` |
| Option → MOD-* + portion (food-cost) | **ours** (Loyverse can't) | **NEW** `modifier_option_cost` (option-centric) |

### New tables

```
dish_modifier_groups
  dish_id                uuid  → nomenclature(id)            (SALE-*)
  loyverse_modifier_list_id text → pos_loyverse_modifier_lists(id)
  sort_order             int
  UNIQUE (dish_id, loyverse_modifier_list_id)

modifier_option_cost
  loyverse_modifier_option_id text PK → pos_loyverse_modifier_options(id)
  modifier_id            uuid → nomenclature(id)             (MOD-*)
  quantity_per_unit      numeric                              (portion, e.g. 30g)
  -- price_delta NOT stored here: it lives in Loyverse (option.price)
```

`modifier_option_cost` is **option-centric** (one row per Loyverse option) — this matches
the original `idx_nomod_loyverse_modifier_id` intent and avoids per-dish duplication.

### Sync flow (one button)

`loyverse-sync ?action=pull_modifiers` extended to also:
1. GET /modifiers → refresh groups + options (price, stores, **min/max_select**).
2. GET /items → upsert `dish_modifier_groups` from each item's `modifier_ids`.

After a pull, the admin structure == Loyverse exactly. The only locally-owned data is
`modifier_option_cost` (survives pulls; keyed by stable Loyverse option id).

### Writes (Loyverse-first, already built in edge fn v17)

create_modifier / add_modifier_option / remove_modifier_option / recreate_item /
ensure_modifier_stores — all write Loyverse then `pull`. Field reminders:
- item ↔ groups field = **`modifier_ids`** (NOT `modifiers_ids`)
- every POST /modifiers MUST carry **`stores`** or POS hides it

### Costing

option food-cost = `MOD-*.cost_per_unit × modifier_option_cost.quantity_per_unit`.
Customer upsell = Loyverse `option.price`. Margin per option = price − cost.

### Consumer changes

- `useModifierOptions(dishId)`: `dish_modifier_groups` → options (mirror) → left-join `modifier_option_cost` → grouped result with price (Loyverse) + cost (ours).
- `ModifiersPage`: render groups (min/max, stores badge) → options → MOD cost link editor.
- Migrate data out of `nomenclature_modifier_options` into the two new tables, then drop it.

## Phasing

1. **Schema + sync** — new tables; extend `pull_modifiers` to fill them; capture min/max_select. Migrate the 181 smoothie rows.
2. **Read path** — refactor `useModifierOptions` / ModifiersPage / drawer chips to the 2-level model.
3. **Costing** — surface per-option cost/margin in the owner view.
4. **Deprecate** `nomenclature_modifier_options`.

## Open issues
- `min/max_select` arrive null from the current pull — confirm Loyverse returns them (field name) or set per-group defaults.
- Manakish sets (3/6/9/12) ride on this model: a "Box" SALE item + a "Pick Manakish" group with `min_select = max_select = N`. Needs min/max captured (phase 1). See separate feature note.
