---
title: Finance Classification
type: page
tags: [finance, classification, tax]
date: 2026-04-29
status: active
related:
  - "[[Finance/]]"
  - "[[Finance/Receipt Routing]]"
  - "[[Equipment/CapEx Flow]]"
---

# Finance Classification

Source: [`docs/domain/financial-codes.md`](../../docs/domain/financial-codes.md). Every line item on every receipt gets exactly one of four codes. The code drives **where the money lands**: ledger only, BOM-cost roll-up, capex registry, or payroll register.

## The four expense categories

| Code | Name | Description | Example |
|---|---|---|---|
| `COGS` | Cost of Goods Sold | Food ingredients, packaging | Tomatoes, olive oil, takeaway boxes |
| `OPEX` | Operating Expenses | Rent, utilities, cleaning, transport | L1 rent, electricity, motorbike fuel |
| `CAPEX` | Capital Expenditure | Equipment, renovation, furniture | Blast Chiller, sink, signboard |
| `PAYROLL` | Staff Costs | Salaries, social contributions | Cook salary, social security |

## Routing per code

| Code | Lands in |
|---|---|
| `COGS` (RAW ingredient) | `purchase_logs` + WAC update in `supplier_catalog` |
| `COGS` (packaging, etc., not BOM) | `financial_transactions` only |
| `OPEX` | `financial_transactions` only |
| `CAPEX` | `capex_assets` + `capex_transactions` + auto-create `equipment` row (mig 164) |
| `PAYROLL` | `financial_transactions` (with `subcategory='salary'` etc.) |

## Tax (Thailand)

| Tax | Rate | Notes |
|---|---|---|
| **VAT** | 7% | Standard rate. Receipts may or may not include VAT — agent must detect |
| **WHT** | varies | Withholding tax — varies by vendor type (services 3%, rent 5%, etc.) |
| **CIT** | 20% / 15% / 0% | Corporate income tax — Phase 1 likely qualifies for SME reduction |

VAT detection on receipts:

- Makro receipts: itemized VAT line, easy to extract
- Market receipts: usually inclusive, no breakdown — recorded gross
- Online suppliers: varies; agent infers from total vs subtotal arithmetic

## Sub-categories

Each top-level code has a `fin_sub_categories` row for finer-grained reporting:

```
COGS:
  ├── ingredient.raw          (RAW-* line items)
  ├── ingredient.spice        (high-value imports)
  ├── packaging               (boxes, lids, wraps)
  └── consumable              (gloves, towels)

OPEX:
  ├── rent.l1
  ├── rent.l2
  ├── utility.electricity
  ├── utility.water
  ├── utility.internet
  ├── transport               (motorbike L1↔L2, supplier deliveries)
  ├── cleaning
  └── service                 (accountant, lawyer, etc.)

CAPEX:
  ├── equipment.kitchen
  ├── equipment.it            (laptops, tablets, POS hardware)
  ├── furniture
  ├── renovation
  └── signage

PAYROLL:
  ├── salary.regular
  ├── salary.bonus
  ├── social.security
  └── tax.payroll
```

The full list lives in the `fin_sub_categories` table (RLS read-only — see [[Database/RLS Policies]]).

## Auto-classification

The Finance Agent (`agents/finance/AGENT.md`) classifies based on:

1. **Vendor pattern** — Makro Phuket → mostly COGS, some CAPEX. Construction co. → CAPEX.
2. **Description keywords** — "carrot", "olive oil" → ingredient.raw. "blast chiller" → equipment.kitchen.
3. **Adaptive learning** — owner's category overrides on prior receipts from the same vendor are remembered (see Adaptive Receipt Learning, PRs #118–#124)

## Owner override

On every receipt approval, the owner sees the auto-classification and can override per-line. Overrides feed back into the adaptive learner (`agents/finance/learnings/`).

## Edge cases

The agent's classification guidelines live in `agents/finance/guidelines/classification.md` (when present). Cases that don't fit cleanly:

- Mixed receipt (CAPEX + COGS on one bill — common at Makro): split per line, each line gets its own code
- Bundled service (e.g. accountant invoice that includes payroll-tax filing): split if discernible, else file as `OPEX > service`
- Pre-paid (e.g. 6-month rent up front): record full amount as OPEX in the month paid; matching expense per accrual basis is a separate report concern, not the ledger

## See Also

- [[Finance/Ledger]] — the ledger architecture this routes into
- [[Finance/Receipt Routing]] — the parser side
- [[Equipment/CapEx Flow]] — the CAPEX-specific auto-create flow
- [`docs/domain/financial-codes.md`](../../docs/domain/financial-codes.md)
