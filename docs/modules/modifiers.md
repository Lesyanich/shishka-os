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

1. **Schema + sync** — new tables (`dish_modifier_groups`, `modifier_option_cost`); extend `pull_modifiers` to fill them; capture min/max_select. Migrate the 181 smoothie rows.
2. **Read path** — refactor `useModifierOptions` / ModifiersPage / drawer chips to the 2-level model.
3. **Admin 2-level editor** — `/bom` MOD tab shows groups→options, drill in, add/remove options + price + option→MOD cost link.
4. **Per-dish attachment editor** — attach/detach modifier groups to a dish in admin.
5. **Push orchestration** — single admin "Push to Loyverse" that runs the fixed order (groups → items → re-attach) and auto re-attaches; per-dish/group sync-status + "needs push" indicator.
6. **Costing** — surface per-option cost/margin in the owner view.
7. **Deprecate** `nomenclature_modifier_options`.

## Admin UX (CEO requirements, 2026-06-02)

The owner manages the whole modifier system **in the admin** and **pushes to Loyverse** — never editing in Loyverse directly. Requirements:

1. **2-level view on `/bom` MOD tab** (today MOD is just a flat filter with category/uncategorized grouping in RecipeBuilder). Show **groups → options** (the real levels), drill into a group, **add/remove options**, edit option price + the option→MOD cost link.
2. **Per-dish modifier attachment editor.** For a given SALE dish, see + edit which modifier groups apply (e.g. attach "Pick Fruits" to Custom Smoothie, "Extra Fruit"/"Nuts" to others). This is the thing that keeps breaking when edited only in Loyverse.
3. **Admin-driven sync to Loyverse for BOTH items and modifiers.** One "Push to Loyverse" surface that pushes the admin state (groups, options, prices, stores, dish attachments, item fields). Today only single SALE dishes have a push button (OwnerTab); modifiers + attachments have no push UI.

### Push orchestration (MUST follow this order)

Because **updating a modifier in Loyverse detaches it from all items** (verified quirk — see reference_loyverse_api_quirks), and because item upsert ignores modifier/category changes, the push must run in this fixed order:

1. Sync categories.
2. Sync modifier groups + options + prices + **`stores`** (create/update). ← detaches items, expected
3. Sync item fields (name/desc/price/photo).
4. **LAST: attach modifier groups to items** via `recreate_item` (DELETE+CREATE with `modifier_ids`). Always the final step; re-run for any dish whose groups changed.

The admin push button must encapsulate this — the owner clicks once, the orchestration handles ordering + re-attach. Never expose a path that edits a modifier without re-attaching its dishes.

### Sync status visibility

Admin should show, per dish and per group: is it synced, does Loyverse match admin, when last pushed. Drives a "needs push" indicator so drift (like the 2026-06-02 incident where smoothies silently lost their fruit/booster/nuts groups) is visible, not discovered in the POS.

> POS device note: after a push, the Loyverse POS app caches the menu — the device may need pull-to-refresh / re-sync before new modifiers appear. Not a data bug.

## Open issues
- `min/max_select` arrive null from the current pull — confirm Loyverse returns them (field name) or set per-group defaults.
- Manakish sets (3/6/9/12) ride on this model: a "Box" SALE item + a "Pick Manakish" group with `min_select = max_select = N`. Needs min/max captured (phase 1). See separate feature note.
- Modifier-edit-detaches-items quirk makes ad-hoc edits dangerous — all the more reason the push must be admin-orchestrated, not manual.
