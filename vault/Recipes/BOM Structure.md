---
title: BOM Structure
type: page
tags: [recipes, bom, lego]
date: 2026-04-29
status: active
related:
  - "[[Recipes/]]"
  - "[[Database/Schema]]"
  - "[[Menu/Pricing & Margins]]"
---

# BOM Structure

The "Lego BOM" — how every Shishka dish decomposes into reusable parts. Read [`docs/domain/nomenclature.md`](../../docs/domain/nomenclature.md) and `docs/constitution/core-rules.md` (RULE-LEGO-CHAIN) for the canonical version.

## Four product types

| Type | Code prefix | What it is | Example |
|---|---|---|---|
| **RAW** | `RAW-*` | Raw ingredient purchased from a supplier | `RAW-FRESH_CARROT` |
| **PF** | `PF-*` | Semi-finished — a prep recipe of RAW + other PF | `PF-BAKED_PUMPKIN`, `PF-VEGETABLE_BROTH` |
| **MOD** | `MOD-*` | Modifier / topping — added to a SALE at order time | `MOD-SOUR_CREAM` |
| **SALE** | `SALE-*` | Final dish sold to a customer | `SALE-BORSCH_BIOACTIVE` |

## The chain (immutable rule)

```
SALE  →  PF  →  RAW            (a dish with prep)
SALE  →  RAW                   (a dish from raw only)
SALE  →  MOD  (added at order)
PF    →  PF   →  RAW           (compound prep)
MOD   →  RAW                   (modifiers cannot contain PF)
RAW   →  ∅                     (ingredient, no further decomposition)
```

**Hard constraints (enforced at write time):**

- A SALE must contain ≥1 BOM ingredient. Empty SALE is invalid.
- PF can contain RAW and other PF.
- MOD can contain **only RAW** — no nested PF in modifiers.
- Circular references are forbidden — `A → B → A` will fail.
- Code uses ALL CAPS with underscores: `TYPE-DESCRIPTION_PARTS`.

## Database backing

| Table | Role |
|---|---|
| `nomenclature` | All four product types in one table — distinguished by `product_code` prefix and `type` |
| `bom_structures` | Edge list — `(parent_id, child_id, qty, unit)` defining the tree |
| `product_categories` | Customer-facing menu category (e.g. `Bowls`, `Salads`, `Drinks`) — hangs off SALE rows only |
| `nomenclature_tags` ↔ `tags` | Cross-cutting labels (vegan, gluten-free, contains-nuts, etc.) |

See [[Database/Schema]] for the full SQL.

## Cost rollup

Food cost flows up the tree using **Weighted Average Cost (WAC)** from [[Procurement/Suppliers]] / `supplier_catalog`:

```
RAW.cost_per_unit  =  WAC computed from purchase history
PF.cost            =  Σ (child.cost × qty) for each BOM line
SALE.cost          =  Σ PF + RAW children (and MOD costs are tracked per-order)
SALE.fc%           =  SALE.cost / SALE.price × 100
```

`bom_structures` rollup is what powers the Menu owner table's color-coded FC% column. See [[Menu/Pricing & Margins]] for the green/amber/red zones.

## Example — `SALE-BORSCH_BIOACTIVE`

```
SALE-BORSCH_BIOACTIVE                       (price: ฿180, target FC ≤ 30%)
├── PF-BORSCH_BASE                          (1 portion = 250g)
│   ├── PF-VEGETABLE_BROTH                  (200g)
│   │   ├── RAW-FRESH_CARROT                (10g)
│   │   ├── RAW-FRESH_CELERY                (10g)
│   │   ├── RAW-FRESH_ONION                 (5g)
│   │   └── RAW-FILTERED_WATER              (180g)
│   ├── RAW-FRESH_BEET                      (40g)
│   ├── RAW-FRESH_CABBAGE                   (15g)
│   └── RAW-FRESH_TOMATO                    (10g)
├── MOD-SOUR_CREAM                          (15g, optional, customer-add)
└── MOD-FRESH_DILL                          (2g, optional)
```

Modifiers are excluded from the base SALE cost — they're added line items on the receipt.

## Rules for the Chef Agent

When the Chef Agent proposes a new dish:

1. Decompose into RAW → PF → MOD → SALE
2. Verify all RAW exist in `supplier_catalog`; if not, emit a [[Procurement/]] task
3. Compute roll-up cost; reject if `FC > 45%` (red zone) without a price-side justification
4. Apply [[Recipes/Kitchen Philosophy]] red lines
5. Insert via `mcp-chef.create_nomenclature` + `mcp-chef.create_bom_lines`

## See Also

- [[Recipes/Production Routing]] — what `recipes_flow` adds on top of `bom_structures`
- [[Database/Domain Contracts]] — table ownership matrix (chef owns these)
- `docs/domain/nomenclature.md` — canonical naming
- `apps/admin-panel/src/components/kitchen/RecipeBuilder.tsx` — UI for authoring BOMs
