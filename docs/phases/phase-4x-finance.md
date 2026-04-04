# Phase 4.1–4.17: Finance Ledger & AI Receipt Parsing

**Date:** 2026-03-10 – 2026-03-11
**Status:** COMPLETED (superseded by Phase 5.0f for receipt parsing)

## Phase 4.1: Financial Ledger, Multi-currency & Receipt Storage

### Migration 024: Expense Ledger
- `expense_ledger` TABLE: full financial record with multi-currency support
- `amount_thb` GENERATED ALWAYS AS `(amount_original * exchange_rate) STORED`
- `receipts` Storage bucket (5MB, JPEG/PNG/WebP/PDF, public read)
- Frontend: FinanceManager.tsx with KPI strip + ExpenseForm + MonthlyChart + ExpenseHistory

### Key Pattern: Two-query + JS join
`useExpenseLedger.ts` — 4 separate queries (ledger + categories + sub_categories + suppliers) + JS join. NEVER use implicit `.select('table(col)')` (acts as INNER JOIN, hides NULL FK rows).

## Phase 4.2: Historical Sync & Smart UI

### Migration 025: Historical Import
- 19 suppliers + 62 expenses (Oct 2025 – Mar 2026) imported
- FinanceManager refactored: 905 lines → component extraction (MagicDropzone, ReceiptLightbox, KpiCard, etc.)

## Phase 4.3–4.3c: UI Refinement & RLS Fixes

### Migration 026: Data Cleanup
- `comments`, `has_tax_invoice` columns added to expense_ledger
- 62-row bulk cleanup (details, comments, sub_category_code)

### Migrations 027-029: RLS Policy Fixes
- 027: Supplier mapping fix (water rows)
- 028: `fin_categories` + `fin_sub_categories` SELECT policies (were missing!)
- 029: `suppliers` SELECT policy → public read (was authenticated-only)

### Database Schema Note Created
- `02_Obsidian_Vault/Database Schema.md` — Boris Rule #10 created

## Phase 4.4: AI Receipt Routing & Hub-Spoke Architecture

### Hub & Spoke Model
```
expense_ledger (Hub)
  ├── purchase_logs    (Spoke 1: food items)     — expense_id FK
  ├── capex_transactions (Spoke 2: equipment)    — expense_id FK
  └── opex_items       (Spoke 3: consumables)    — expense_id FK
```

### Migration 030: smart_receipt_routing.sql
- FKs added: purchase_logs.expense_id, capex_transactions.expense_id
- `opex_items` TABLE created
- `fn_approve_receipt(JSONB)` — atomic RPC: inserts Hub + 3 Spokes in single TX

### Edge Function: parse-receipts (v1)
- OpenAI gpt-4o-mini (vision), deployed via Supabase Dashboard

## Phase 4.5: Advanced Ledger Analytics

- Sortable columns, composable filter panel, dynamic subtotal footer
- Expandable spoke rows with lazy-fetch `useSpokeData` hook (module-scope Map cache)

## Phase 4.5b-4.5d: Supplier Defaults & Zero Data Loss

### Migration 032: Supplier defaults
- `suppliers.category_code` FK added, all 19+ suppliers categorized
- 3-tier category resolution in fn_approve_receipt: payload → supplier default → 2000 fallback

### Migration 033: Makro supplier fix
- fn_approve_receipt v3: supplier_name ILIKE lookup → AUTO-CREATE new supplier

### Migration 034: Zero Data Loss
- fn_approve_receipt v4: auto-create nomenclature `RAW-AUTO-{hash}` for unmapped food items
- Boris Rule #12 created (transaction date integrity)

## Phase 4.6–4.17: OCR Evolution (Superseded)

Extensive iteration on receipt OCR accuracy:
- 4.6: Smart Mapping Engine + `supplier_item_mapping` table (Migration 035)
- 4.7-4.9: OCR prompt rewrites, anti-hallucination, 3-zone receipt anatomy
- 4.10-4.11: Edge Function OOM fix, Deno Base64 performance
- 4.12: JSON truncation fix (max_tokens)
- 4.13: Structured Outputs attempted → reverted (CFG compilation timeout)
- 4.14: Async receipt_jobs + Realtime (Migration 036) — Boris Rule #13
- 4.15-4.16: Zero-footprint pipeline → WebP compression → UX tiling
- 4.17: Two-stage GCV + gpt-4o-mini pipeline (Migration 037: ocr_text column)

**All OpenAI-based receipt parsing replaced by GAS + Gemini in Phase 5.0f.**

### Security Audit (Migration 031)
Column-level REVOKE on sensitive fields: nomenclature.cost_per_unit, production_plans.mrp_result, inventory_batches.barcode, stock_transfers (all), purchase_logs (all), etc. SECURITY DEFINER RPCs retain full privileges.

→ Receipt architecture: `02_Obsidian_Vault/Receipt Routing Architecture.md`
→ Schema: `02_Obsidian_Vault/Database Schema.md`
