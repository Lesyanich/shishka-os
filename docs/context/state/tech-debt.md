# Technical Debt Register

Consolidated from all phases. Items marked with phase of origin.

## Active Debt

### Phase 6: UoM Conversion UI (pending)
- `useSupplierMapping` hook returns `MappingMatch` with conversion data, but UI not yet built
- ~~`fn_approve_receipt` does not yet apply `conversion_factor`~~ → **FIXED in Migration 040 (v6)**
- Need: UoM Badge + Inline Editor in StagingArea (Phase 6.5)
- Need: Batch UoM Tuning view in Procurement (Phase 6.6)

### Phase 6: Pending Migrations
- Migration 040 needs SQL execution in Dashboard (Supabase CLI not linked)
- GAS needs `clasp push && npm run deploy` from `03_Development/gas/`

### Phase 5: Bundle Size
- recharts adds ~300KB to bundle → use `React.lazy()` + `Suspense` for CapExMiniChart
- Not yet implemented

### Security: No Authentication (Phase 7+)
- Admin panel uses `anon` key — anyone with Supabase URL + anon key can make API calls
- Column-level REVOKE (Migration 031) mitigates worst cases
- Recommend: add Supabase Auth

### Security: Remaining Column-Level Risks
- `expense_ledger.amount_original` / `exchange_rate` — admin panel's ExpenseEditModal uses direct `.update()`. Column-level REVOKE would break edit modal. Migrate to RPC-based update.
- `nomenclature.price` — sale price updateable via admin panel. Add audit log for price changes.
- `inventory_balances.quantity` — legitimately updated for stocktake. Move to RPC-based stocktake.

### Finance: SmartTextInput NLP
- Quick-log input exists as UI stub — NLP parser not yet connected
- Future: extract amount, supplier, category from natural language

## Resolved Debt

- ~~No auto-refresh~~ → Supabase Realtime (Phase 2)
- ~~Monolithic FinanceManager.tsx (905 lines)~~ → Component extraction (Phase 4.2)
- ~~Image compression kills OCR~~ → WebP byte compression + UX tiling (Phase 4.16b)
- ~~Synchronous receipt parsing timeout~~ → Async receipt_jobs + Realtime (Phase 4.14)
- ~~OpenAI Vision cost ($0.03/receipt)~~ → GAS + Gemini 2.5 Flash (free tier) (Phase 5.0f)
