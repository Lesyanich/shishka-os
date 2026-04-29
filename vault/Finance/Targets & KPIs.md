---
title: Finance Targets & KPIs
type: page
tags: [finance, kpi, targets]
date: 2026-04-29
status: active
related:
  - "[[Finance/]]"
  - "[[Menu/Pricing & Margins]]"
  - "[[Operations/Locations]]"
---

# Finance Targets & KPIs

Source: [`docs/bible/targets.md`](../../docs/bible/targets.md). The owner-ratified financial targets every Shishka decision is benchmarked against.

## Headline target

**Food Cost (FC) ≤ 30%** of menu price.

Achieved through:

- Zero-waste production (salmon trimmings → tartare, bones → broth, vegetable scraps → CBS Boosters)
- Standardized "bricks" — vacuum-sealed at L1, no L2 cooking variance
- CBS converting low-cost raw materials into high-perceived-value additives
- Cross-utilization (one ingredient feeds 5+ dishes) — never downgrading ingredient class

See [[Menu/Pricing & Margins]] for the per-dish color zones (green / amber / red) on the admin owner table.

## Cost structure (fixed monthly, Phase 1)

| Line | Amount | Notes |
|---|---|---|
| L1 rent | 18,000 THB | Paid for 1 year |
| L2 rent | 20,000 THB | Paid for 6 months |
| Staff | 4–6 people | See [[Operations/Staff]] |

Full breakdown by `fin_sub_categories` lives in the [[Finance/Ledger]].

## Revenue model

| Source | Phase | Notes |
|---|---|---|
| **Primary**: L2 Tops Daily — salad bar + grab-and-go + hot meals | Phase 1 (now) | High-traffic location, 32 m² |
| **Secondary**: L1 mini-store — roadside sales, bottled sauces, sourdough | Phase 2 | Roadside + 2nd-floor seating |
| **Future**: yoga mornings + 3rd-floor seating at L1 | Phase 3 | Permits in process |

**Take-away vs eat-in split: 80% / 20%** — drives plating, packaging, warming choices.

## Operational KPIs

| KPI | Target | Source / measurement |
|---|---|---|
| **Time to Receipt (TTR)** | <2 min at L2 | Cashier pings KDS → receipt printed; instrumentation TBD |
| **Delivery cycles** | 3×/day from L1 to L2 | Operations log |
| **Batch prep window** | 07:00–10:00 daily | [[Operations/Daily Standards]] |
| **Blast Chiller cycle** | <90 min (+85°C → +3°C) | Equipment instrumentation TBD; today it's a stopwatch check |
| **L2 batch reject rate** | 0% (<+8°C arrival) | Shift Leader rejects + logs in HACCP sheet |

## Growth phases

```
Phase 1  —  Prove the model at Rawai (L1 + L2)              — March 2026
Phase 2  —  Expand L1 to mini-store + optimize operations   — TBD
Phase 3  —  Add seating + yoga + explore franchise          — TBD
```

Each phase has its own go/no-go gate based on Phase-1 financial proof:

- **Phase 1 → 2 gate** — sustained FC ≤ 30%, TTR <2 min, 3 months positive cash flow
- **Phase 2 → 3 gate** — L1 mini-store contributes ≥20% of revenue, customer NPS ≥50

## Zero-waste economics

Specific examples where "waste" outperforms the original ingredient:

| Original | "Waste" use | Margin lift |
|---|---|---|
| Salmon trimmings | Tartare / poke (`SALE-SALMON_TARTARE_RICE-BURGER`) | Higher than the fillet itself |
| Chicken bones / trimmings | Broth (`PF-CHICKEN_RAMEN_BASE`) | Pure margin — was "trash" |
| Herb stems, lemon rinds, vegetable peels | CBS Boosters (Green Gold Oil, Shishka Dust) | Premium add-on per bowl |

The result: **higher margin on "waste" than on the original ingredient**. This is one of the structural reasons the FC ≤ 30% target is reachable.

## Reporting cadence

- **Daily**: cash close (per shift)
- **Weekly**: revenue × FC% rollup, owner reviews
- **Monthly**: full P&L reconciliation against bank statements
- **Quarterly**: tax filing (VAT, CIT for the operating company)

Daily/weekly views land on `apps/admin-panel/src/pages/FinanceAnalytics.tsx`. Monthly/quarterly are exported.

## See Also

- [[Menu/Pricing & Margins]] — the per-dish view of FC%
- [[Finance/Ledger]] — the architecture that produces these reports
- [[Operations/Daily Standards]] — the operational tempo behind the KPIs
- [`docs/bible/targets.md`](../../docs/bible/targets.md)
