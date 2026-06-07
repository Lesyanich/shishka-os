# Manakish Bundles

Build-your-own manakish sets. The price depends on which manakish the customer
picks and is always cheaper than buying the same items à la carte.

| Bundle | Manakish | Sauces | Discount |
|--------|----------|--------|----------|
| `SALE-BUNDLE_MANAKISH_4`  | pick 4  | 1 free | −15 % on the manakish |
| `SALE-BUNDLE_MANAKISH_8`  | pick 8  | 2 free | −15 % on the manakish |
| `SALE-BUNDLE_MANAKISH_12` | pick 12 | 3 free | −15 % on the manakish |

- **Manakish pool** = every available dish in category `KP-FIN-MAN` (🫓 Manaish). Repeats allowed (e.g. 4× Za'atar).
- **Sauce pool** = the ฿39 cups in category `KP-FIN-SDR` (price ≤ ฿50). Sauces are **free**.
- **Price** = `round( Σ(manakish price) × (1 − 0.15) )`. Sauces add nothing.

The discount % is a single constant — change it in **two places that must stay in sync**:
`packages/contracts/src/bundles.ts` (`BUNDLE_DISCOUNT_PCT`) and the mirror in
`services/supabase/functions/create-order/index.ts`.

## Website / app (apps/web)

Fully automatic. The Bundles section on the menu opens a constructor
(`BundleBuilder`): the customer picks the manakish (with +/- steppers) and the
sauce(s); the live price + savings are shown; "Add bundle" puts it in the cart.

The server is the source of truth: `create-order` re-reads every manakish price,
re-validates the pools and counts, and recomputes the total — the client price is
never trusted. A bundle is stored as a **parent `order_items` row** (the bundle
dish, carrying the money) plus **child rows** (the chosen manakish/sauces,
`parent_item_id` set, `modifier_type` = `manakish` | `sauce`, price 0). The KDS /
`OrderDetailsModal` already render this parent→child shape.

## Cashier (Loyverse POS)

Bundles are **not** pushed as Loyverse items: a Loyverse modifier can't express
repeats of the same flavour at a variable price. Instead use a native
**percentage discount**:

1. In Loyverse Back Office create three discounts: **"Bundle ×4 −15 %"**,
   **"Bundle ×8 −15 %"**, **"Bundle ×12 −15 %"** (percentage type).
2. At the register, ring the chosen manakish (each as its normal item) + the
   sauce(s), then apply the matching bundle discount.
3. **Free sauce:** either 100 %-off the sauce line, or fold the sauce into the
   single percentage — owner's choice. *(If you fold it in, the POS total will
   differ slightly from the website total, which discounts only the manakish.)*

Receipts ingest normally via the `loyverse-receipt` webhook — no extra setup.

## Open decisions (confirm before launch)

- **Exact discount %** (currently 15 %).
- **POS sauce handling** (100 %-off the sauce line vs. fold into the % discount).
