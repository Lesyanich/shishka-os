---
title: Finance
type: domain
tags:
  - domain
  - finance
  - ledger
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: Money in and out — receipts, expenses, capex, and the unified ledger that records every financial event.
related:
  - "[[Domains/Procurement]]"
  - "[[Domains/Menu]]"
aliases:
  - Bookkeeping
  - Accounting
---

# Finance

> [!info] Domain
> Every money movement at Shishka — receipts, expenses, capex assets, and the unified ledger that ties them to operations.

## Definition

Finance owns the complete record of money flowing through the business: supplier receipts, operating expenses (OPEX), cost of goods (COGS), and capital expenditure (CAPEX) for equipment. The receipt pipeline parses photos via vision, classifies line items, and on approval auto-creates `capex_assets` rows for equipment and posts to `expense_ledger` for OPEX/COGS.

## Boundaries

Inside: receipts, expense_ledger, capex_assets, depreciation, food cost, margin reporting. Outside: ordering and supplier negotiation ([[Domains/Procurement]]), pricing decisions ([[Domains/Menu]]), and physical equipment placement ([[Domains/Kitchen]]).

## Active Projects

- [[Projects/Adaptive Receipt Learning]] — self-learning OCR for receipts and invoices
- [[Projects/GDrive Receipt Archive]] — receipt photo intake from Drive
- [[Projects/Phase 7.1 DB Architecture]] — WAC costing and ledger schema

## Recent Decisions

- [[Decisions/D-005-db-and-mc-english-only]] — ledger entries written in English

## See Also

- Architecture: [[Architecture/Financial Ledger]], [[Architecture/Receipt Routing Architecture]]
- Milestones: [[Milestones/2026-04-28-approve-receipt-capex-auto]]
