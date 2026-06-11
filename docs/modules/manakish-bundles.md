# Manakish Bundles

Build-your-own manakish sets: **Manakish set of 4 / 8 / 12**. The customer picks
the manakish (any flavour, **repeats allowed**) + free sauces; the price is
computed from the selection and the discount **grows with size**.

| Set | Manakish | Free sauces | Discount | Floor |
|-----|----------|-------------|----------|-------|
| ×4  | pick 4   | 1 | −10 % | From ฿212 |
| ×8  | pick 8   | 2 | −15 % | From ฿400 |
| ×12 | pick 12  | 3 | −20 % | From ฿564 |

## Pricing — `price_tiers` is the source of truth

One product, many prices. The regular price stays on `nomenclature.price`; every
other context (the three bundle sizes, and later Grab/delivery or timed promos)
is a row in **`price_tiers`** (`tier_code`, `discount_pct`, `category_code`,
`valid_from/to`, `is_active`, + bundle metadata `bundle_dish_code`,
`bundle_manakish_count`, `bundle_sauce_count`). Migrations **255 / 256 / 258 / 259**.

- Each manakish is discounted **and rounded individually** (`Σ round(price ×
  (1 − pct))`), so the website, the ordering app and the POS match to the baht.
- `v_dish_tier_prices` = the effective per-dish price for each active tier.
- `v_public_menu.from_price` derives the bundle floor (`count × cheapest manakish
  at the tier`) → ฿212 / 400 / 564. (The Custom Smoothie's floor still comes from
  its modifier groups — ฿109.)
- **Manakish pool** = the `KP-FIN-MAN` **subtree** (Classic/Signature/Premium
  leaves after the taxonomy split, mig 258 — match by prefix). **Sauce pool** =
  `KP-FIN-SDR` cups (≤ ฿50).
- **Change the discount:** edit `price_tiers.discount_pct`, then re-run the POS
  generator (below). The site + `create-order` read it live.
- `valid_from/to` are reserved for time-bounded promos (logic is a future add).

## Three surfaces, one price model

### 1. Cashier — Loyverse POS (`bundle-pos-setup` edge fn)

**No modifiers, no Loyverse discount, zero cashier steps.** One Loyverse
**category per size** — `🫓 Manakish set of 4 / 8 / 12` (the 🫓 sorts them next to
the Manaish category) — each holding **every manakish at that size's discounted
price** + the **free sauces at ฿0**. The cashier opens the category, taps manakish
(repeat = quantity) + a free sauce; the price is already the bundle price.

These items live **only in Loyverse** (a generated projection) — no duplication in
the catalog or on the site.

Built/maintained by the **`bundle-pos-setup`** edge function (verify_jwt off):
- `POST /functions/v1/bundle-pos-setup` — deletes any leftover slot lists, ensures
  the 3 categories (renaming older names in place), and upserts every item at the
  price from `v_dish_tier_prices`. **Idempotent** — re-run after any price/discount
  or roster change.
- `GET` the same URL — read-only check: returns the live categories + item prices.

### 2. Live site — shishka.health (`shishka-health` repo)

A lightweight **order builder (cart)** — no payment; guests assemble an order and
see the total to show at the counter. The **Manakish section** shows 3 bundle
cards (“Manakish set of 4 — from ฿212”, −X% badge). Tapping one opens a
**constructor** with **strict counts** (exactly 4/8/12 manakish via steppers,
repeats allowed; 1/2/3 free sauces), a live total + savings. Reads `price_tiers`
+ `menu_public`. (PR `shishka-health#5`.)

### 3. Ordering app — `shishka-os/apps/web` (PR #314, with PR #279)

The QR/ordering app's `BundleBuilder` + `create-order` edge function. The server
re-reads every manakish price, re-validates the pools (manakish = `KP-FIN-MAN`
subtree; sauce = `KP-FIN-SDR` ≤ ฿50) and the exact counts, reads the tier
discount from `price_tiers`, and recomputes the total. A bundle persists as a
**parent `order_items` row** (carries the money) + **child rows**
(`parent_item_id`, `modifier_type` = `manakish` | `sauce`).

## Key objects

- Migrations **250–259** (bundle dishes, `product_code` on the view,
  `chk_modifier_type`, `price_tiers` + bundle metadata, subtree match, labels).
- Edge functions: **`create-order`** (v5), **`bundle-pos-setup`**.
- Bundle dishes: `SALE-BUNDLE_MANAKISH_{4,8,12}` in category `KP-FIN-BND`
  (catalog/site representation; price 0, floor computed).

## Superseded approaches (history)

Two earlier POS designs were abandoned: a **single-item % discount** (couldn't
cleanly do free sauce) and **Loyverse slot modifiers** (12 single-select lists —
the cashier hated the dropdowns). Migration **254** and
`scripts/loyverse/setup-bundle-modifiers.sh` belonged to the slot approach and
are no longer used; the slot lists were deleted from Loyverse by `bundle-pos-setup`.

## Open / future

- Loyverse-only bundle items don't map back to `nomenclature` for receipt BOM /
  reporting (acceptable for now).
- Timed-promo logic on `price_tiers.valid_from/to`.
- The website cart has no online payment by design (pay at the counter).
