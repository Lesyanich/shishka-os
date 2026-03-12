# Frontend Architecture Rules

Tech stack: React + Vite + Tailwind CSS v4 + Supabase + TypeScript strict mode.

## 1. Routing
NEVER use `useState` for page switching in ERP. Always use `react-router-dom` with `BrowserRouter` — deep linking is critical for B2B SaaS.

## 2. recharts TypeScript
The `Tooltip` `formatter` prop has strict generics. Never annotate params explicitly — use inferred types and cast with `as` where needed.

## 3. Supabase Joins
When joining across FK relationships (e.g. `capex_transactions.category_code → fin_categories.code`), prefer **2 separate queries + JS join** over implicit `.select('table(col)')` — more predictable across Supabase versions.

## 4. Unused Imports
TypeScript strict mode (`tsc -b`) catches unused imports as errors. Always verify imports before committing.

## 5. Graceful Degradation
Every widget MUST handle 3 states:
- `isLoading` → skeleton
- `error` → error message
- empty data → placeholder

Never let a widget crash on null.

## 6. File Locations
- State: `docs/context/state/CURRENT.md` (NOT root)
- Handover: `02_Obsidian_Vault/Handover/HANDOVER.md`
- Dev server: `03_Development/admin-panel/` (port 5173)

## 7. Git Workflow
Before starting any new major phase or feature, create a new git branch (e.g. `feature/phase-N-name`). Never commit directly to `main` during active development.

## 8. BOM Hub Filtering (→ Boris Rule #8)
See `docs/context/constitution/boris-rules.md` — filter strictly by product_code prefix.
