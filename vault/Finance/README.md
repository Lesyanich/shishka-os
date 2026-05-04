---
title: Finance
type: entity
tags: [finance, accounting]
date: 2026-04-29
status: active
assets:
  - label: "Receipt scans archive (Drive)"
    path: "Drive: 01_Business/Receipts/"
    url: "https://drive.google.com/drive/folders/14OGn_hOSlOB0TNotMHD9_geKojVYlYAt"
  - label: "POS exports"
    path: "Drive: 01_Business/POS/"
    url: "https://drive.google.com/drive/folders/1KZ-Rb6MuXkQxmapN9h6dMX3Fg9_-q7TA"
related:
  - "[[Procurement/]]"
  - "[[Equipment/CapEx Flow]]"
  - "[[Menu/Pricing & Margins]]"
---

# Finance

The books — every Thai baht in and out of Shishka. From a photo of a receipt to a row in the ledger to a KPI on the dashboard. Finance is **the entry point** for most operational data: equipment purchases, ingredient costs, rent, payroll, taxes — all originate here.

> [!info] One-line definition
> Finance is the source-of-record for cash flow, classified into COGS / OPEX / CAPEX / PAYROLL, with receipts as the universal entry-point and the WAC roll-up feeding [[Menu/Pricing & Margins]].

## Sub-pages

- [[Finance/Classification]] — COGS / CAPEX / OPEX / PAYROLL rules + Thai VAT/WHT
- [[Finance/Targets & KPIs]] — FC ≤ 30%, TTR <2 min, growth phases
- [[Finance/Ledger]] — financial transactions architecture (moved from `Architecture/`)
- [[Finance/Receipt Routing]] — receipt → inbox → OCR → classify → ledger flow (moved from `Architecture/`)

## Where things live

| Asset | Location |
|---|---|
| Ledger SSoT | `financial_transactions` table (DB) |
| Receipt inbox | `receipt_inbox` + `receipt_jobs` tables |
| Receipt photos | Supabase Storage (initial), then Drive `01_Business/Finance/Receipts/<YYYY-MM>/` (archive) |
| CapEx assets | `capex_assets` + `capex_transactions` (see [[Equipment/CapEx Flow]]) |
| Categories | `fin_categories` + `fin_sub_categories` tables |
| Finance Agent | `agents/finance/AGENT.md`; MCP server `services/mcp-finance/` |
| Admin UI | `apps/admin-panel/src/pages/FinanceLedger.tsx`, `FinanceAnalytics.tsx`, `ReceiptInbox.tsx` |

## Receipt → Ledger flow (1-line)

```
photo → inbox → OCR (Gemini) → parse lines → classify (cat/sub) → owner approve → fn_approve_receipt → ledger + (capex|purchase_logs|opex)
```

See [[Finance/Receipt Routing]] for the full architecture and [[Equipment/CapEx Flow]] for the equipment-specific path.

## Adjacent entities

- [[Procurement/]] — RAW purchases lock with WAC into `supplier_catalog`
- [[Equipment/]] — CAPEX rows auto-create equipment entries
- [[Menu/Pricing & Margins]] — FC ≤ 30% target the ledger validates
- [[Operations/Locations]] — rent costs by location

## Recent decisions / milestones

- 2026-04-28 — `fn_approve_receipt` auto-creates capex_assets (commit `9ddb6c2`, mig 164)
- Adaptive Receipt Learning (PRs #118–#124) — alias / category override / GS1 / diff-engine modules

## Open questions

- TBD — full Q3 reconciliation pipeline (manual today)
- See [[Open Questions/ceo-vs-coo-role-split]] when written

## See Also

- `agents/finance/AGENT.md`
- `docs/domain/financial-codes.md`
- `services/mcp-finance/` — the MCP that owns these tables
