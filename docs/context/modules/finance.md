# Finance Module Context

## Tables
- `expense_ledger` — Financial SSoT (Hub). Multi-currency, generated amount_thb. Phase 6.6: delivery_fee column.
- `fin_categories` (code INT) — 18 standardized financial codes
- `fin_sub_categories` (sub_code INT) — 28 sub-categories
- `suppliers` — With category_code defaults. Auto-created on receipt.
- `purchase_logs` — Food item purchases (Spoke 1, expense_id FK)
- `capex_transactions` — Equipment purchases (Spoke 2, expense_id FK)
- `opex_items` — Operating expense items (Spoke 3, expense_id FK CASCADE)

## RPCs
- `fn_approve_receipt(JSONB)` v7 — Atomic Hub+Spoke insert. 3-tier supplier resolution (payload → ILIKE → auto-create). 3-tier category resolution (payload → supplier default → 2000). Auto-creates nomenclature for unmapped food items. **v6: applies conversion_factor from supplier_item_mapping** — recalculates quantity + price_per_unit, preserves total_price. **v7: delivery_fee in Hub INSERT**.
- `fn_update_cost_on_purchase()` — Trigger: auto-updates nomenclature.cost_per_unit on purchase_logs INSERT
- `fn_cleanup_stale_receipt_jobs()` — Marks zombie jobs (>5min) as failed

## Edge Functions
- `parse-receipts` — Proxy to GAS. Zero-body, reads job_id from URL query param.
- `update-receipt-job` — Callback for GAS. `--no-verify-jwt`. Service role key for RLS bypass.

## GAS
- `ReceiptParser.gs` — Gemini 2.5 Flash vision+JSON. 6-step Phone Home architecture. **Phase 6.6: sanitizeNumber_/sanitizeSigned_ strip OCR dust. Schema: brand, package_weight, delivery_fee.**
- Deploy: `cd 03_Development/gas && npm run deploy`

## Frontend
| File | Purpose |
|---|---|
| `src/pages/FinanceManager.tsx` | Orchestrator: KPI strip + form/staging toggle + chart + history |
| `src/components/finance/StagingArea.tsx` | AI receipt preview: editable tables, reconciliation, nomenclature mapping |
| `src/components/finance/MagicDropzone.tsx` | Drag-drop upload, WebP compression, async job creation |
| `src/components/finance/ExpenseForm.tsx` | Manual expense entry form |
| `src/components/finance/ExpenseHistory.tsx` | Sortable/filterable ledger table with expandable spoke rows |
| `src/components/finance/ExpenseFilterPanel.tsx` | Date range, category, supplier, flow type, text search |
| `src/components/finance/SpokeDetail.tsx` | Expandable row: 3 color-coded mini-tables |
| `src/components/finance/ExpenseEditModal.tsx` | Edit existing expense |
| `src/components/finance/ReconciliationPanel.tsx` | Inline in StagingArea |
| `src/hooks/useExpenseLedger.ts` | 4-query + JS join (ledger + categories + sub_categories + suppliers) |
| `src/hooks/useSupplierMapping.ts` | Smart SKU→name mapping with match_count ranking + UoM updateConversion |
| `src/hooks/useSpokeData.ts` | Lazy-fetch spoke data with module-scope Map cache |

## Patterns & Gotchas
- **NEVER** use `.select('*, fin_categories(name)')` — acts as INNER JOIN, hides NULL FK rows. Use 2 separate queries + JS join.
- Module-scope cache in `useSpokeData` (not useRef) — survives unmount/remount cycles.
- `amount_thb` is GENERATED ALWAYS — never INSERT/UPDATE directly.
- Column-level REVOKE on purchase_logs, stock_transfers (Migration 031) — RPCs retain privileges via SECURITY DEFINER.

→ Schema: `02_Obsidian_Vault/Database Schema.md`
→ Receipt architecture: `02_Obsidian_Vault/Receipt Routing Architecture.md`
→ Phase history: `docs/context/phases/phase-4x-finance.md`
