# Spec — Hot/Iced as a POS modifier, replacing twin iced SKUs

> MC Task: 93da602a-a99b-4ae6-b281-310cf4d8b9d6
> Status: migration written and dry-run verified; blocked on the CEO creating the `Temperature +10` list in Loyverse
> Blocked by: task d8d35bf6 / PR #575 (Milk + Coffee Boosters) — same tables, same dishes

## 1. Problem

The till carries twin items for the same drink: `Latte` 75 and `Iced Latte` 85. The pair drifts
— Iced Latte had no Milk group while hot Latte did (task d8d35bf6). Every future modifier change
has to be applied twice, and the second application is the one that gets forgotten.

CEO direction (2026-08-12): keep one item per drink and put a Hot/Cold button on it wherever the
recipe allows both.

## 2. CEO decisions (2026-08-12)

| Question | Decision |
|---|---|
| Twin SKUs | **Retire the iced items.** One item per drink + a required Hot/Iced choice. |
| Pricing | **Two lists** — a paid one (Iced +10) and the existing free one, because a Loyverse option carries one price across every item it is attached to. |
| Scope | **Only the 5 existing pairs.** No new hot builds for drinks that are iced-only today. |

## 3. Scope

| Surviving item | Price (hot) | Iced today | Temperature list |
|---|---|---|---|
| SALE-COFFEE_AMERICANO | 65 | 65 | Temperature (free) |
| SALE-COFFEE_CAPPUCCINO | 75 | 85 | Temperature +10 |
| SALE-COFFEE_LATTE | 75 | 85 | Temperature +10 |
| SALE-COFFEE_CARAMEL_LATTE | 105 | 115 | Temperature +10 |
| SALE-MATCHA_LATTE | 90 | 100 | Temperature +10 |

Retired: `SALE-COFFEE_ICED_AMERICANO`, `SALE-COFFEE_ICED_CAPPUCCINO`, `SALE-COFFEE_ICED_LATTE`,
`SALE-COFFEE_ICED_CARAMEL_LATTE`, `SALE-MATCHA_ICED_LATTE`.

Guest-facing prices are unchanged in every case.

## 4. Design

### 4.1 Why modifiers and not Loyverse variants

`loyverse-sync` builds every item with a single `"Regular"` variant and stamps `sku = product_code`
on it (`services/supabase/functions/loyverse-sync/index.ts:390-431`). Native Loyverse variants
would require reworking the sync, the SKU contract and the deduction path. The modifier rail
(`dish_modifier_groups` + `nomenclature_modifier_options` + `modifier_option_cost`) already carries
Milk and Coffee Boosters, so Temperature rides the same rail.

### 4.2 Packaging moves into the modifier

Hot and iced differ by more than ice:

| | Hot | Iced |
|---|---|---|
| Cup | RAW-CUP_PAPER_8OZ | RAW-CUP_PP_18OZ |
| Lid | RAW-LID_PAPER_8OZ | RAW-LID_DOME_95MM |
| Straw | — | RAW-STRAW_ECO_21CM |
| Ice | — | RAW-ICE_CUBES 0.25 kg |

A MOD cannot subtract a component, so packaging cannot stay in the dish BOM. It moves **out** of
the 5 surviving dish BOMs and **into** two MOD items. Because the Temperature group is
required (`min_select = 1`), exactly one of them fires on every order, so packaging is deducted
exactly once.

- `MOD-TEMP_HOT` → paper cup + paper lid
- `MOD-TEMP_ICED` → PP cup + dome lid + straw + ice

Base dish BOM after the change = drink only (espresso / matcha, milk, syrup).

`fn_deduct_order_bom` already explodes the BOM of any `order_item_modifiers` row with a bound
`modifier_id` (`services/supabase/migrations/200_fn_deduct_order_bom_audit_only.sql:64-80`), so
this needs no deduction-logic change — only the `modifier_option_cost` links.

### 4.3 Loyverse lists

A **`Temperature` list already exists** (`9238fecb-a800-40f0-9311-1aece967e562`) with options
`Hot` 0 / `Iced` 0, attached to zero dishes and with no cost links. Reuse it for Americano.

The paid list must be created: `Temperature +10`, options `Hot` 0 / `Iced` 10. The sync exposes a
create path (`POST /modifiers`, `loyverse-sync/index.ts:563-577`), so this is scriptable — no
manual Back Office work.

### 4.4 Retirement is a soft delete

`handleDeleteDish` calls Loyverse `DELETE /items/{id}` and resets the row to `pos_status='draft'`,
`loyverse_item_id=null` (`loyverse-sync/index.ts:160-184`). Loyverse soft-deletes, so historical
receipts keep reporting correctly. The website drops the item automatically: `menu_public` filters
on `pos_status='synced' AND is_available=true`
(`services/supabase/migrations/250b_visitor_site_public_menu.sql:84-113`).

## 5. Steps

1. **Precondition** — PR #575 merged and pushed to Loyverse, till verified. Do not start before this.
2. **Precondition** — the `Temperature +10` list exists in Loyverse (`Hot` ฿0 / `Iced` ฿10, required,
   max 1) and the mirror is refreshed via `loyverse-sync?action=pull_modifiers`. The migration
   resolves both lists by name and its §0 guard aborts if this list or its ฿10 `Iced` option is
   missing, so it cannot be applied early.
3. Migration `406_drink_temperature_modifier.sql`:
   - give `MOD-TEMP_HOT` + `MOD-TEMP_ICED` the BOMs in §4.2 (the nomenclature rows already exist)
   - strip the 2 packaging lines from each of the 5 surviving dish BOMs
   - wire `modifier_option_cost` for the 4 Temperature options → the 2 MODs
   - `dish_modifier_groups` + `nomenclature_modifier_options` rows for the 5 dishes
   - set `attachments_dirty = true`
4. CEO pushes attachments, verifies at the till.
5. Retire the 5 iced items through the push queue (`action='delete'`) — a separate migration, only
   once step 4 is signed off, so there is a rollback path.

## 6. Resolved: Iced Cappuccino (CEO, 2026-08-12)

`SALE-COFFEE_ICED_CAPPUCCINO` carries **24 g espresso** against 12 g on every other coffee, so
collapsing it into the 12 g Cappuccino weakens the drink and a shared `Iced` option cannot add a
shot for cappuccino alone.

**CEO decision: collapse it anyway** — "keep hot and ice Cappuccino together and don't worry about
the recipe". Cappuccino is therefore standardised at 12 g and Iced Cappuccino is retired with the
other four. A barista who wants the old strength adds `MOD-ESPRESSO_EXTRA` from Coffee Boosters.

## 7. Acceptance

- Each of the 5 drinks shows Temperature (required, first), then Milk, then Coffee Boosters.
- Ringing Latte + Iced totals 85; Americano + Iced totals 65.
- One iced order deducts exactly one PP cup, one dome lid, one straw, ice — and zero paper cups.
- The 5 iced items are gone from the till and from shishka.health; Loyverse sales history intact.

## 8. Known follow-ups (not this task)

- 3 iced coffees have no `RAW-ICE_CUBES` line at all today — resolved incidentally by §4.2, but the
  same gap may exist on other iced drinks outside this scope.
- `MOD-MILK_COW` carries 0.2 L cow milk while the base latte BOM also carries 0.2 L. If a guest
  explicitly picks "Cow Milk", stock deducts twice. Pre-existing, unrelated to this change.
- `MOD-ESPRESSO_EXTRA` and the syrup MODs have no BOM, so paid boosters deduct no stock.
- Whether shishka.health actually renders the `menu_modifiers` view is a HEALTH-repo question.
