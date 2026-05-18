# MBA Frameworks — Strategic COO Reference

> **Load trigger:** Strategic COO reads this file when CEO asks about pricing, profitability, spend decisions, menu performance, or backlog prioritization. See `AGENT.md` § Framework Load Triggers for the full list.
>
> **Shishka Scale:** This is a 4-person kitchen (Lesia, Bas, Alex, Hein) doing 30-60k THB/month revenue from two locations (L1 production kitchen, L2 Tops retail). Every framework below is calibrated for this reality — not Fortune 500 playbooks.

---

## 1. Unit Economics Per Dish

### Purpose

Answer "is this dish worth selling?" with a number, not a feeling. Every SALE item must have a known contribution margin before going on the menu.

### Core Formula

```
Food Cost         = Chef MCP calculate_cost(product_code) → cost_per_unit (WAC-based)
Packaging Cost    = per container type (see table below)
Channel Commission = Grab 30% of selling price | walk-in 0% | Tops consignment TBD%

Contribution Margin (THB) = Selling Price − Food Cost − Packaging − Commission
Contribution Margin %     = Contribution Margin / Selling Price × 100

Break-even (dishes/day) = Daily Fixed Costs / Contribution Margin per dish
```

### Packaging Cost Table

| Container | Cost (THB) | Used for |
|-----------|-----------|----------|
| Paper box 750ml | ~5 | Manakeesh, wraps |
| Clear lid bowl 500ml | ~4 | Porridge, salads |
| Sauce cup 30ml | ~1 | Dips, dressings |
| Kraft bag | ~3 | Grab delivery outer |

> Update these when supplier prices change. Source: latest Makro/Lazada purchase.

### Thresholds

| Metric | Green | Amber | Red |
|--------|-------|-------|-----|
| Food cost % | <30% | 30-45% | >45% |
| Contribution margin % | >55% | 40-55% | <40% |
| Break-even dishes/day | <5 | 5-15 | >15 |

### How to Use

1. Pull food cost: `calculate_cost(product_code='SALE_...')`
2. Add packaging from table above
3. Apply channel commission
4. Calculate contribution margin
5. Compare against thresholds
6. If red → flag to CEO with specific recommendation (re-price, swap ingredient, cut)

### Example

```
Meat Manakeesh (SALE_MANAKEESH_MEAT):
  Selling price:    ฿189
  Food cost:        ฿52 (27.5%) ✅ green
  Packaging:        ฿8 (box + bag)
  Grab commission:  ฿56.70 (30%)
  
  Walk-in margin:   ฿189 − ฿52 − ฿8 = ฿129 (68%) ✅
  Grab margin:      ฿189 − ฿52 − ฿8 − ฿56.70 = ฿72.30 (38%) 🟡 amber
  
  Conclusion: Walk-in excellent. Grab viable but tight — 
  consider Grab-specific price ฿209 to recover margin.
```

---

## 2. Cash Flow Decision Tree

### Purpose

Every spend decision above 500 THB goes through a structured filter. Prevents emotional purchases and ensures cash runway is protected.

### Decision Types (Bezos Framework)

| Type | Definition | Process | Examples |
|------|-----------|---------|----------|
| **Type 2** (reversible) | Can undo within 7 days, low sunk cost | Approve fast, monitor, revert if wrong | Ingredient order, small tool, subscription trial |
| **Type 1** (irreversible) | Cannot undo, high commitment | Full analysis + CEO sign-off | Equipment, lease, hire, long-term contract |

### Decision Tree

```
SPEND REQUEST
│
├─ < 500 THB?
│   └─ YES → Approve. Log in expenses. Done.
│
├─ 500 - 5,000 THB?
│   ├─ Reversible (Type 2)?
│   │   ├─ YES → Does it serve a current initiative?
│   │   │   ├─ YES → Approve. Set 7-day review reminder.
│   │   │   └─ NO  → Defer. Log to MC backlog.
│   │   └─ NO (Type 1) → Go to Full Analysis below.
│   │
│   └─ Recurring monthly?
│       └─ YES → Treat as Type 1 (12x multiplier).
│
├─ 5,000 - 20,000 THB?
│   └─ Always Type 1 → Full Analysis required.
│
└─ > 20,000 THB?
    └─ Type 1 + defer 48h cooling period before final decision.
```

### Full Analysis Template (Type 1)

Answer all 5 before recommending:

1. **Bottleneck test (TOC):** Does this directly remove the #1 constraint on revenue/operations?
2. **Payback period:** At current revenue, how many months to recover this cost?
3. **Deferral test:** Can we wait 30 days without measurable damage?
4. **Alternative test:** Is there a cheaper way to achieve 80% of the same result?
5. **Cash runway impact:** After this purchase, how many months of runway remain at current burn?

### Current Parameters (update monthly)

```
Monthly burn rate:     ~60-80k THB (rent + salaries + ingredients + utilities)
Cash reserve target:   2 months of burn = 120-160k THB
Revenue:               30-60k THB/month (growing)
Gap:                   Burn > Revenue → every THB of spend is borrowed time
```

> **Rule:** While burn > revenue, every Type 1 spend must pass the bottleneck test. "Nice to have" = "not now."

---

## 3. Menu Engineering BCG Matrix

### Purpose

Classify every menu item into action categories using sales data + cost data. Stop guessing which dishes to promote, fix, or cut.

### Matrix

```
                        ← HIGH POPULARITY →          ← LOW POPULARITY →
                    ┌─────────────────────────┬─────────────────────────┐
  HIGH MARGIN       │       ★ STAR            │      ? PUZZLE           │
  (food cost <30%)  │                         │                         │
                    │  Action: PROTECT         │  Action: PROMOTE        │
                    │  • Keep recipe stable    │  • Better menu position │
                    │  • Feature prominently   │  • Staff recommends     │
                    │  • Never discount        │  • Photo/description ↑  │
                    │  • Monitor for drift     │  • Time-limited push    │
                    │                         │  • If no lift → re-test │
                    ├─────────────────────────┼─────────────────────────┤
  LOW MARGIN        │     🐴 PLOWHORSE        │      🐕 DOG             │
  (food cost >30%)  │                         │                         │
                    │  Action: RE-ENGINEER     │  Action: CUT or REVAMP  │
                    │  • Raise price 5-10%     │  • Remove from menu     │
                    │  • Swap costly ingredient│  • OR radically re-do   │
                    │  • Reduce portion size   │  • Don't invest more    │
                    │  • Bundle with high-     │  • Free up kitchen time │
                    │    margin add-on         │    for Stars/Puzzles    │
                    └─────────────────────────┴─────────────────────────┘
```

### Data Sources

| Metric | Source | How to get |
|--------|--------|-----------|
| **Popularity** (sales count) | Loyverse receipts → `stock_movements` | Query sales count per SALE item over last 30 days |
| **Food cost %** | Chef MCP `calculate_cost` | `cost_per_unit / selling_price × 100` |
| **Median split** | Calculated | Median of all items on each axis divides the quadrants |

### Classification Protocol

1. Pull last 30 days of sales per SALE item (or production records if Loyverse not yet live)
2. Pull food cost % for each item from Chef MCP
3. Calculate median popularity and median food cost %
4. Plot each item into its quadrant
5. Present to CEO with recommended action per item

### Shishka-Specific Rules

- **New items** (<14 days on menu): exclude from classification, mark as "probation"
- **Seasonal items**: compare against same-season prior data if available
- **L1 vs L2 split**: classify separately — an item may be a Star at L2 (impulse buy) but a Dog at L1 (no foot traffic)
- **Minimum data**: need ≥14 days of sales data before classification is meaningful

### Example Output

```
MENU ENGINEERING REPORT — May 2026

Stars (protect):
  • Meat Manakeesh — 68% margin, 12 sales/week ★
  • Cheese Manakeesh — 62% margin, 10 sales/week ★

Plowhorses (re-engineer):
  • Halloumi Wrap — 28% margin, 8 sales/week 🐴
    → Recommendation: raise price ฿10 or swap to local cheese blend

Puzzles (promote):
  • Pumpkin Manakeesh — 71% margin, 3 sales/week ?
    → Recommendation: feature as "Chef's Pick", add photo to Grab

Dogs (cut/revamp):
  • (none currently — all items are new)

Probation (< 14 days):
  • Overnight Oats — launched May 18, check back June 1
```

---

## 4. RICE Scoring for Backlog Prioritization

### Purpose

Prioritize 50+ MC tasks objectively. Replace "what feels urgent" with "what delivers the most value per unit of effort."

### Formula

```
RICE Score = (Reach × Impact × Confidence) / Effort
```

### Scale Definitions (Shishka-Adapted)

**Reach** — How many people/processes affected per month

| Score | Meaning | Examples |
|-------|---------|---------|
| 10 | All customers + all staff | Payment system, menu availability |
| 7 | All customers OR all staff | POS integration, KDS display |
| 5 | One location or one channel | L2 Tops workflow, Grab listing |
| 3 | One role (e.g., cooks only) | Cook PIN system, recipe flow |
| 1 | Only CEO/admin | Admin panel feature, reporting |

**Impact** — Effect on core business goal (revenue, cost, quality)

| Score | Meaning | Test |
|-------|---------|------|
| 3 | Massive | Directly unblocks new revenue stream or prevents shutdown |
| 2 | High | Saves >1 hour/day of manual work OR reduces cost >5% |
| 1 | Medium | Improves quality, reduces errors, better UX |
| 0.5 | Low | Nice-to-have, marginal improvement |
| 0.25 | Minimal | Cosmetic, cleanup, tech debt with no user impact |

**Confidence** — How sure are we this will work?

| Score | Meaning | Criteria |
|-------|---------|----------|
| 100% | High | Spec exists + similar work done before + data supports it |
| 80% | Medium | Spec exists but untested approach OR no spec but proven pattern |
| 50% | Low | No spec + new territory + uncertain outcome |

**Effort** — Person-sessions to complete (1 session ≈ 3 hours of `/code` work)

| Sessions | Meaning |
|----------|---------|
| 0.5 | Quick fix, config change |
| 1 | Single-session task |
| 2 | Two sessions, one PR |
| 3-5 | Multi-session, possibly multi-PR |
| 8+ | Epic, needs decomposition first |

### Scoring Protocol

1. Pull MC tasks: `list_tasks(status="inbox")` + `list_tasks(status="inbox", priority="critical")`
2. For each task, estimate R, I, C, E
3. Calculate RICE score
4. Sort descending
5. Present top 10 to CEO with scores and one-line rationale each
6. CEO picks — RICE informs, doesn't dictate

### Example

```
BACKLOG TRIAGE — RICE Ranked

#1  Loyverse selective sync (29d8ed01)
    R=10 × I=3 × C=80% / E=2 = 12.0
    Why: Unblocks all POS sales tracking

#2  Assembly UI /assembly (T6)
    R=5 × I=2 × C=80% / E=3 = 2.67
    Why: L2 workflow currently manual

#3  Cook PIN system (6e4b56bf)
    R=3 × I=1 × C=80% / E=2 = 1.2
    Why: Security + accountability

#4  Brain UI graph (knowledge base)
    R=1 × I=0.5 × C=50% / E=5 = 0.05
    Why: CEO wants it but low urgency, high effort
```

### Rules

- **Re-score monthly** or when priorities shift (new location, cash crisis, big customer)
- **Never RICE emergency tasks** — fires get fought immediately regardless of score
- **Decompose before scoring** if effort >5 sessions — score the sub-tasks instead
- **CEO override is valid** — RICE is a tool, not a dictator. If CEO says "I need X now," do X. But log the override reason.

---

## Appendix: Framework Selection Guide

| CEO says... | Load framework |
|-------------|---------------|
| "Сколько стоит это блюдо?" / "выгодно ли?" / new dish / pricing | § 1 Unit Economics |
| "Можем ли мы позволить?" / equipment / hire / big purchase | § 2 Cash Flow Decision Tree |
| "Что продаётся?" / "что убрать из меню?" / menu review | § 3 Menu Engineering BCG |
| "Что делать дальше?" / "что в приоритете?" / sprint planning | § 4 RICE Scoring |
| Monthly/weekly review | All four in sequence |
