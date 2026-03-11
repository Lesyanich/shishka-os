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

## 📓 Obsidian Protocol (Boris Rule #9)
**Obsidian Skills** installed in `.claude/skills/` (kepano/obsidian-skills). At the end of every major development phase, the agent MUST:
1. Create or update an **architecture note** (`.md` file) in `02_Obsidian_Vault/` root using Obsidian Flavored Markdown (wikilinks, frontmatter tags, callouts).
2. The note MUST contain: YAML frontmatter with `tags` and `date`, a description of what the phase built, `[[backlinks]]` to related modules (e.g. `[[MRP Engine]]`, `[[Orders Pipeline]]`), and a Mermaid diagram or table if applicable.
3. **Never** leave orphan notes — every new note must be linked from at least one existing note or from STATE.md.
4. Legacy/obsolete content lives in `02_Obsidian_Vault/_Archive/` — never delete, always archive.

## 📊 Database Documentation Protocol (Boris Rule #10)
When any migration **creates or alters** a table/function/trigger/enum, the agent MUST update `02_Obsidian_Vault/Database Schema.md`:
1. Keep the **Mermaid erDiagram** block in sync with all current tables and FK relationships.
2. Keep the **Tables index** table up to date (Table | PK | Key Columns | FKs | Migration).
3. Keep the **RPCs & Triggers** table up to date.
4. This file is the single visual reference for the entire Supabase schema — it must always reflect the latest deployed state.

## 🔒 SSoT Commit Gate (Boris Rule #11)
**NEVER** run `git push` until `STATE.md` and `Database Schema.md` are both updated to reflect the changes being pushed. This is a hard gate — no exceptions. Checklist before every push:
1. `02_Obsidian_Vault/Handover/STATE.md` — new section documenting what was changed (migrations, frontend files, data fixes)
2. `02_Obsidian_Vault/Database Schema.md` — updated if any migration touched tables, policies, RPCs, or ENUMs
3. Both files staged and included in the commit (or a separate `chore:` commit before push)

## 📅 Data Integrity: Transaction Dates (Boris Rule #12)
**NEVER** overwrite historical `transaction_date` values. Dates come STRICTLY from source documents (receipt, invoice). `CURRENT_DATE` is only acceptable as an absolute last-resort fallback in the RPC when the frontend fails to provide a date. Migrations must NEVER set `transaction_date = CURRENT_DATE` to "fix" sorting — this violates ERP audit standards.

## ⏱️ Edge Function + LLM Latency (Boris Rule #13)
Long-running AI tasks (>30s), such as Vision OCR for long receipts, **MUST NOT** rely on synchronous HTTP responses. Supabase Edge Functions have a **150s request idle timeout** and **200ms CPU limit** — gpt-4o vision tasks routinely take 30-90s. While we temporarily use `json_object` mode to avoid the 150s timeout (OpenAI `json_schema` Structured Outputs add 10-60s CFG compilation on cold calls), the **architectural standard for Phase 4.14+** is the **Async Webhook/Polling pattern** using Supabase Realtime (insert job row → Edge Function writes result → frontend subscribes via Realtime).

## 📂 Context Routing (Point, Don't Dump)
- **Global Rules:** Read `gemini.md`
- **Database State & Schema:** Read `02_Obsidian_Vault/Database Schema.md` (erDiagram) + `02_Obsidian_Vault/Handover/STATE.md`
- **Handover Reports:** Read `02_Obsidian_Vault/Handover/HANDOVER.md`
- **Plans & Architecture:** Read files in `/docs/` and `/02_Obsidian_Vault/`
- **Frontend Blueprint:** Read `docs/PLAN-ShishkaOS-Dashboard.md`
- **Archived Legacy Docs:** `02_Obsidian_Vault/_Archive/`