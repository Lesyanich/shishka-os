# Technical Debt Register

Consolidated from all phases. Items marked with phase of origin.

## Active Debt

### Phase 6: UoM Conversion (mostly complete)
- ~~`fn_approve_receipt` does not yet apply `conversion_factor`~~ → **FIXED in Migration 040 (v6)**
- ~~UoM Badge + Inline Editor in StagingArea~~ → **DONE (Phase 6.5)**
- Need: Batch UoM Tuning view in Procurement (Phase 6.7+)

### Phase 6.6: Pending Migrations & Deploys
- Migration 041 needs SQL execution in Dashboard (Supabase CLI not linked)
- GAS needs `clasp push && npm run deploy` from `services/gas/`

### ~~Phase 5: Bundle Size~~ → RESOLVED (Phase 9)
- ~~recharts adds ~300KB to bundle → use `React.lazy()` + `Suspense` for CapExMiniChart~~ → **DONE: MonthlyChart + CapExMiniChart lazy loaded**

### ~~Security: No Authentication (Phase 7+)~~ → RESOLVED (Phase 8)
- ~~Admin panel uses `anon` key~~ → **DONE: Supabase Auth (email/password), all 30 tables auth_full_access RLS (054)**

### Security: Remaining Column-Level Risks
- `expense_ledger.amount_original` / `exchange_rate` — admin panel's ExpenseEditModal uses direct `.update()`. Column-level REVOKE would break edit modal. Migrate to RPC-based update.
- `nomenclature.price` — sale price updateable via admin panel. Add audit log for price changes.
- `inventory_balances.quantity` — legitimately updated for stocktake. Move to RPC-based stocktake.

### Finance Agent: Google Drive Receipt Backup (organize_receipt)
- Tool `organize_receipt` referenced in SKILL.md but **never implemented**
- Current flow: agent uploads photos to Supabase Storage only
- Needed: after `approve_receipt`, copy receipt photo to `01_Business/Receipts/processed/{YYYY-MM}/` on Google Drive
- Must also write the GDrive path back to DB (e.g. `expense_ledger.gdrive_path`)
- Enables: offline access to receipts, human-friendly folder browsing, audit trail on shared drive
- Priority: HIGH (owner relies on GDrive as receipt archive)

### Finance: SmartTextInput NLP
- Quick-log input exists as UI stub — NLP parser not yet connected
- Future: extract amount, supplier, category from natural language

## Resolved Debt

- ~~No auto-refresh~~ → Supabase Realtime (Phase 2)
- ~~Monolithic FinanceManager.tsx (905 lines)~~ → Component extraction (Phase 4.2)
- ~~Image compression kills OCR~~ → WebP byte compression + UX tiling (Phase 4.16b)
- ~~Synchronous receipt parsing timeout~~ → Async receipt_jobs + Realtime (Phase 4.14)
- ~~OpenAI Vision cost ($0.03/receipt)~~ → GAS + Gemini 2.5 Flash (free tier) (Phase 5.0f)
- ~~OCR dust in numbers (225!, 210')~~ → sanitizeNumber_/sanitizeSigned_ in GAS (Phase 6.6)
- ~~No delivery_fee capture~~ → delivery_fee in footer + expense_ledger + ReconciliationPanel (Phase 6.6)
- ~~Lost brand/package_weight metadata~~ → Gemini schema + FoodItem chips (Phase 6.6)
