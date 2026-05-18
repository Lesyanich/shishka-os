# Loyverse Dashboard — Naming Conventions

**Audience:** Lesia (operates Loyverse Dashboard at <https://r.loyverse.com>).
**Why this matters:** admin-panel `/menu/modifiers` pull job auto-fills the
internal `slot` enum from the Loyverse modifier_list name. Following these
conventions removes manual slot-tagging work on every pull.

## Modifier list names

When you create a modifier_list in Loyverse Dashboard, name it **exactly** one
of:

- `Base`
- `Protein`
- `Greens`
- `Topping`
- `Sauce`

Case-insensitive, but spelling must match. The pull job lowercases the name
and checks it against the universal slot enum.

If you name a list something else (e.g. `Spices`, `Add-ons`, `Sides`):
- The pull job stores it in the mirror tables as-is.
- The `Pull now` button in `/menu/modifiers` surfaces a warning.
- You must manually pick the slot in the Add-binding form per option.

## Modifier list min/max-select

- `Base` — min:1 max:1 (one base required)
- `Protein` — min:1 max:1 (one protein required; can be `none`)
- `Greens` — min:0 max:3 (up to three greens)
- `Topping` — min:0 max:3 (up to three toppings)
- `Sauce` — min:0 max:1 (one sauce or none)

These rules are enforced by Loyverse on cashier UX. admin-panel does not
re-enforce them.

## Option naming

- Use clear, customer-facing English (e.g. `Chicken`, `Tofu`, `Spinach`).
- Avoid Thai-only names for now — admin-panel maps option name → MOD
  nomenclature by hand, and Thai → MOD search is harder. Thai labels are fine
  once a Loyverse-option ↔ MOD binding exists.
- Same option name across multiple dishes is fine; each (dish, option) binding
  is a separate row in `nomenclature_modifier_options`.

## When to rename a list

Renaming a modifier_list in Loyverse Dashboard does NOT break existing
bindings — they're joined on `loyverse_modifier_id` (option id), not list
name. The next pull just refreshes the `loyverse_modifier_list_name` snapshot
on every binding row.

## Phase 2 future

Once admin-panel `/kds/assembly` (T8) is built and the SSoT flips, modifier
management moves into admin-panel and Loyverse Dashboard becomes read-only
for modifier_lists. This doc gets updated then.
