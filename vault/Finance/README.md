---
title: Finance
type: entity
tags: [finance]
date: 2026-04-29
status: placeholder
assets:
  - label: "Receipt scans archive (Drive)"
    path: "Drive: Shishka healthy kitchen/Finance/Receipts/"
---

# Finance

> [!warning] Placeholder
> This entity folder will be populated during the content build-out (MC task B-3, follow-up to audit `a180ff33`). For now it is a stub.

## Scope

Receipts, COGS / CAPEX / OPEX classification, ledger model, financial targets, capex flow.

## Sources to extract from (B-3 input)

- `expense_ledger` table — financial ledger SSoT
- `capex_assets`, `capex_transactions` (auto-created by `fn_approve_receipt`)
- `vault/Architecture/Financial Ledger.md` (will move to `Finance/Ledger.md`)
- `vault/Architecture/Receipt Routing Architecture.md` (will move to `Finance/Receipt Routing.md`)
- `docs/bible/targets.md` — financial targets, KPIs
- `agents/finance/AGENT.md`
