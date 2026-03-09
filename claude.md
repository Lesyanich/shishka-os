# 🦾 CLAUDE.md — Shishka OS Core Guidelines & Memory

## 🎯 Project Vision
Transforming Shishka Healthy Kitchen into a tech-driven scale-up via "Shishka OS" — a unified ERP/KDS system (React + Vite + Tailwind v4 + Supabase).

## 📜 P0 Rules (CRITICAL - DO NOT BREAK)
1. **SSoT (Single Source of Truth):** Supabase (PostgreSQL 17.6) is the ONLY source of truth. UI is just a mirror.
2. **UUID Compliance:** All database relationships MUST use UUIDs. No exceptions.
3. **Lego-Architecture (BOM):** Menu modules: RAW (Raw) -> PF (Semi) -> MOD (Topping) -> SALE (Dish).
4. **No Direct DB Edits:** All DB schema changes must be written as SQL migrations in `03_Development/supabase/migrations/`.
5. **State Management:** Always read `STATE.md` before starting a task and update it after completion.

## 🧠 Compound Engineering (The Boris Rule)
If you make a mistake and the user corrects you, you MUST update this `CLAUDE.md` file (or relevant reference files) to ensure you NEVER make this mistake again.

## 🛣️ Frontend Architecture Rules (Phase 5+)
0. **BOM Hub Filtering (Boris Rule #8):** Nomenclature tabs MUST filter STRICTLY by product_code prefix: `SALE-%`, `PF-%`, `MOD-%`, `RAW-%`. NEVER use `.or()` with `type.eq.dish` or any other type field — items can have ambiguous types that leak across tabs. Always use `.ilike('product_code', 'PREFIX-%')` only.
1. **Routing:** NEVER use `useState` for page switching in ERP. Always use `react-router-dom` with `BrowserRouter` — deep linking is critical for B2B SaaS.
2. **recharts TypeScript:** The `Tooltip` `formatter` prop has strict generics. Never annotate params explicitly — use inferred types and cast with `as` where needed.
3. **Supabase Joins:** When joining across FK relationships (e.g. `capex_transactions.category_code → fin_categories.code`), prefer 2 separate queries + JS join over implicit `.select('table(col)')` — more predictable across Supabase versions.
4. **Unused Imports:** TypeScript strict mode (`tsc -b`) catches unused imports as errors. Always verify imports before committing.
5. **Graceful Degradation:** Every widget MUST handle 3 states: `isLoading` (skeleton), `error` (message), and empty data (placeholder). Never let a widget crash on null.
6. **File Location:** STATE.md lives at `02_Obsidian_Vault/Handover/STATE.md`, NOT at root. HANDOVER.md is at `02_Obsidian_Vault/Handover/HANDOVER.md`.
7. **Git Workflow:** Before starting any new major phase or feature, the agent MUST create a new git branch (e.g. `feature/phase-N-name`) for context isolation and to protect the `main` branch. Never commit directly to `main` during active development.

## 📂 Context Routing (Point, Don't Dump)
- **Global Rules:** Read `gemini.md`
- **Database State & Schema:** Read `02_Obsidian_Vault/Handover/STATE.md`
- **Handover Reports:** Read `02_Obsidian_Vault/Handover/HANDOVER.md`
- **Plans & Architecture:** Read files in `/docs/` and `/02_Obsidian_Vault/Blueprints/`
- **Frontend Blueprint:** Read `docs/PLAN-ShishkaOS-Dashboard.md`