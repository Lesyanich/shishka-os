# Manakish Bundles

Build-your-own manakish sets. The customer picks which manakish (any flavour,
repeats allowed) + free sauce(s); the price is computed from the selection and
is always cheaper than buying the same items à la carte.

| Bundle | Manakish | Sauces | Floor |
|--------|----------|--------|-------|
| `SALE-BUNDLE_MANAKISH_4`  | pick 4  | 1 free | From ฿200 |
| `SALE-BUNDLE_MANAKISH_8`  | pick 8  | 2 free | From ฿400 |
| `SALE-BUNDLE_MANAKISH_12` | pick 12 | 3 free | From ฿600 |

## Pricing

Each manakish is discounted **−15 % and rounded individually** (this keeps the
website and the POS identical to the baht):

| À la carte | In a bundle |
|-----------|-------------|
| ฿59 | ฿50 |
| ฿69 | ฿59 |
| ฿79 | ฿67 |
| ฿89 (Lion's Mane) | ฿76 |

`bundle price = Σ round(manakish × 0.85)`; sauces are free. The "floor" is the
cheapest fill (all ฿50 manakish). Discount % lives in **two synced places**:
`packages/contracts/src/bundles.ts` (`BUNDLE_DISCOUNT_PCT`) and the inline mirror
in `services/supabase/functions/create-order/index.ts`. The slot-modifier option
prices in Loyverse are baked at setup time — re-run the setup (below) if the
discount changes.

## "From ฿X" pricing (also covers the Custom Smoothie)

Build-your-own dishes show **From ฿X** = the cheapest orderable configuration.
The mandatory count per modifier group is stored in `dish_modifier_groups.min_select`
(Loyverse doesn't sync min_select, so we own it). `v_public_menu.from_price`
computes `base + Σ(min_select × cheapest option per group)`:
- Custom Smoothie: ฿89 + 2 cheapest fruits (฿10) = **From ฿109**.
- Bundles: base ฿0 + N × cheapest manakish slot (฿50) = **From ฿200 / 400 / 600**.

## Website / app (apps/web)

The Bundles section opens a constructor (`BundleBuilder`): pick the manakish with
+/- steppers (repeats allowed) + the sauce(s); live price + savings shown.

The server is the source of truth: `create-order` re-reads every manakish price,
re-validates pools (manakish = `KP-FIN-MAN`; sauce = `KP-FIN-SDR` ≤ ฿50) and the
exact counts, and recomputes the total. A bundle is stored as a **parent
`order_items` row** (the bundle dish, carrying the money) + **child rows** (the
chosen manakish/sauces, `parent_item_id`, `modifier_type` = `manakish` | `sauce`).

## Cashier (Loyverse POS) — slot modifiers

Each bundle is a Loyverse item (base ฿0) bound to **slot modifier lists**, the
same shape as the Custom Smoothie. Because there are 13 flavours and ×12 needs
repeats, each pick is its own single-select slot (so the same flavour can be
chosen in several slots):

- **12 shared "Bundle Manakish #1..#12"** lists, each holding all flavours priced
  at their discounted value. ×4 binds #1–4, ×8 binds #1–8, ×12 binds #1–12.
- **3 shared "Bundle Sauce #1..#3"** lists (sauces at ฿0). ×4 binds #1, ×8 #1–2,
  ×12 #1–3.

The cashier opens the bundle, taps a flavour in each slot + a sauce per slot;
Loyverse sums the price. Repeats are supported (pick Za'atar in every slot).

### Re-running / maintaining the POS setup

Everything is created via the `loyverse-sync` edge function (no Back Office UI):
1. `?action=create_modifier` (POST `{name, min_select:1, max_select:1, modifier_options:[{name, price}]}`) — one call per slot list.
2. `?action=recreate_item` (POST `{dish_id, modifier_ids:[...]}`) — binds the slots to each bundle item.
3. `?action=pull_modifiers` — mirrors the new lists into `pos_loyverse_modifier_*` + `dish_modifier_groups`.
4. SQL: set `nomenclature.price = 0` on the bundle dishes and `dish_modifier_groups.min_select = 1` on their slots (drives `from_price`).

If the manakish roster or the discount changes, update each slot list's options
(`add_modifier_option` / `remove_modifier_option` / `push_modifiers`) — the
option price is baked, so all 12 manakish slots must be updated together.

## Open decisions (owner)

- **Exact discount %** (currently 15 %).
- Whether the website should also move to the slot-modifier model (today it uses
  its own parent/child order flow — both channels price identically).
