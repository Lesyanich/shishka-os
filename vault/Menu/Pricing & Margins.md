---
title: Menu Pricing & Margins
type: page
tags: [menu, pricing, finance]
date: 2026-04-29
status: active
related:
  - "[[Menu/]]"
  - "[[Finance/Targets & KPIs]]"
  - "[[Finance/Classification]]"
---

# Menu Pricing & Margins

Source: [`docs/bible/targets.md`](../../docs/bible/targets.md), [`docs/bible/menu-concept.md`](../../docs/bible/menu-concept.md). Vault summarizes — finance owns the full model in [[Finance/Targets & KPIs]].

## Core target

**Food Cost (FC) ≤ 30%** of menu price.

This is the headline KPI for the Shishka business model. A dish exceeding 30% FC is either re-engineered (cross-utilization, cheaper protein cut, smaller portion of the expensive component) or repositioned (premium tier with margin elsewhere on the bill — coffee, soup, dessert).

## How we hit 30% FC

| Lever | Mechanism |
|---|---|
| **Zero-waste production** | Salmon trimmings → tartare; bones → broth; herb stems / lemon rinds / vegetable peels → CBS boosters (Green Gold Oil, Shishka Dust). Result: higher margin on "waste" products than on the original ingredient. |
| **Standardized bricks (no L2 cooking)** | "90% Cooked" proteins, vacuum-sealed at L1, regenerated at L2 in 60 seconds. Eliminates portion drift and cooking loss at the sales point. |
| **CBS — flavor LEGO** | Concentrated boosters made from low-cost raw materials become high-perceived-value additives. 30–45 seconds saved per bowl, ~30% FC delta on the topping. |
| **Cross-utilization** | One ingredient feeds 5+ dishes. Example: sous-vide chicken used in 3 breakfasts, 1 main, 1 salad-bar protein, 1 sandwich. |
| **Local sourcing for superfoods** | Local papaya / mango / Lion's Mane substitute imported berries / European mushrooms — same nutrient profile, fraction of the cost. |
| **In-house dressings + ferments** | Aquafaba mayo, fermented citrus, herb pestos — replace store-bought industrial sauces (which carry both FC and brand-integrity risk). |

See [[Recipes/Kitchen Philosophy]] §6 for the explicit rule: cost cuts come from cross-utilization or local sourcing, **never** from downgrading an ingredient class (no rapeseed substituting olive oil — period).

## Color zones (admin Menu page)

The owner table in `apps/admin-panel/src/pages/menu/components/OwnerTable.tsx` color-codes each dish's food-cost percentage:

- **Green** — `FC ≤ 30%` — within target
- **Amber** — `30% < FC ≤ 45%` — investigate (cross-utilize, premium-bundle, or rework)
- **Red** — `FC > 45%` — fix or remove

Computation: `bom_structures` rolls up RAW costs through PF and MOD layers (Weighted Average Cost from `supplier_catalog`), divided by `nomenclature.price`. See [[Recipes/BOM Structure]] for the rollup mechanics.

## Operational KPIs

- **Time to Receipt (TTR)** — target <2 min at L2
- **Delivery cycles** — 3×/day from L1 to L2
- **Batch prep window** — 07:00–10:00 daily
- **Blast Chiller cycle** — <90 min (+85°C → +3°C)

## Revenue mix

| Source | Phase | Notes |
|---|---|---|
| L2 Tops Daily salad bar + grab-and-go + hot meals | Phase 1 (now) | Primary |
| L1 mini-store — roadside, bottled sauces, sourdough | Phase 2 | Secondary |
| L1 third-floor seating + yoga | Phase 3 | Future |

**Take-away vs eat-in split** — 80% / 20%. Drives plating, packaging, and warming choices.

## Cost structure (fixed, monthly)

| Line | Amount | Notes |
|---|---|---|
| L1 rent | 18,000 THB | Paid for 1 year |
| L2 rent | 20,000 THB | Paid for 6 months |
| Staff | 4–6 people | See [[Operations/Staff]] |

Variable costs (food, utilities, transport, packaging) ride the FC% target.

## See Also

- [[Finance/Targets & KPIs]] — the canonical financial target page
- [[Finance/Classification]] — COGS / CAPEX / OPEX rules
- [[Menu/Concept]] — why CBS hits the 30% target
- [[Recipes/Kitchen Philosophy]] — the cost-vs-quality rule (where compromise is allowed and where it isn't)
