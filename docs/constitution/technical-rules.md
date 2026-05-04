# Technical Rules — Code, DB, Git, Frontend

> Replaces `engineering-rules.md` and `frontend-rules.md`.
>
> Priority: `operational-rules.md` > **Technical Rules (this file)** > Module rules > Task context.
>
> Audience: any agent that touches code, the database, the git tree, or the UI.

---

# PART I — Database & Git Discipline

## RULE-BOM-PREFIX-FILTER

BOM Hub nomenclature tabs **must** filter strictly by `product_code` prefix:
- `RAW-%` → raw materials
- `PF-%` → semi-finished
- `MOD-%` → modifiers/toppings
- `SALE-%` → final dishes

**Never** use `.or()` with `type.eq.dish` or any other `type` field — items can have ambiguous types that leak across tabs. The only valid pattern:
```ts
.ilike('product_code', 'PF-%')
```

> Origin: Production bug — items leaked between tabs because `type` was unreliable. (Legacy: `Boris Rule #8`.)

## RULE-ARCH-NOTE-SYNC

After every major development phase, the agent **must**:

1. Create or update an architecture note (`.md`) in `vault/Architecture/` using Obsidian Flavored Markdown (wikilinks, frontmatter tags, callouts)
2. The note must contain:
   - YAML frontmatter with `tags` and `date`
   - Description of what the phase built
   - `[[backlinks]]` to related modules
   - A Mermaid diagram or table when applicable
3. **Never leave orphan notes** — every new note must be linked from at least one existing note or from `CURRENT.md`
4. Legacy/obsolete content lives in `vault/_Archive/` — never delete, always archive

> Origin: Knowledge base entropy — notes accumulated without backlinks, became unreachable. (Legacy: `Boris Rule #9`.)

## RULE-DB-SCHEMA-DOCS

When any migration creates or alters a table / function / trigger / enum, the agent **must** update `vault/Architecture/Database Schema.md`:

1. Keep the Mermaid `erDiagram` block in sync with all current tables and FK relationships
2. Keep the Tables index up to date: `Table | PK | Key Columns | FKs | Migration`
3. Keep the RPCs & Triggers table up to date

> Origin: Schema doc drift — production tables existed that no doc mentioned. (Legacy: `Boris Rule #10`.)

## RULE-COMMIT-GATE

**Never** run `git push` until the following are all true:

1. The MC task for this work is updated (status, notes) — see `operational-rules.md` § RULE-TASK-CLOSURE
2. `vault/Architecture/Database Schema.md` is updated if any migration touched tables, policies, RPCs, or ENUMs
3. The relevant architecture note (mapping below) is updated if it exists
4. `STATUS.md` is **not** edited manually — it auto-generates on commit (see `operational-rules.md` § RULE-COMPUTED-STATUS)
5. All files staged are intentional — no accidental `.env`, no leftover scratch files

### Module → Architecture Note Mapping

| Module worked on | Architecture note to sync |
|---|---|
| Receipts / OCR | `vault/Architecture/Receipt Routing Architecture.md` |
| Finance | `vault/Architecture/Financial Ledger.md` |
| Procurement | `vault/Architecture/Procurement & Receiving Architecture.md` |
| Product categories | `vault/Architecture/Product Categorization Architecture.md` |
| Overall system | `vault/Architecture/Shishka OS Architecture.md` |

If no architecture note exists for a module, skip — note creation only at phase completion per `RULE-ARCH-NOTE-SYNC`.

> Origin: Multiple incidents where merged code left docs in a stale state. (Legacy: `Boris Rule #11`.)

## RULE-TXN-DATE-INTEGRITY

**Never** overwrite historical `transaction_date` values. Dates come **strictly** from source documents (receipt, invoice).

`CURRENT_DATE` is acceptable **only** as an absolute last-resort fallback in the RPC, when the frontend fails to provide a date. Migrations **must never** set `transaction_date = CURRENT_DATE` to "fix" sorting — that violates ERP audit standards and corrupts the historical record.

> Origin: ERP audit — sorting was "fixed" by overwriting dates, history was destroyed. (Legacy: `Boris Rule #12`.)

## RULE-ASYNC-LLM-PATTERN

Long-running AI tasks (>30s), such as Vision OCR for long receipts, **must not** rely on synchronous HTTP responses.

Constraints:
- Supabase Edge Functions: 150s request idle timeout, 200ms CPU limit
- Synchronous responses for slow LLM jobs will time out and lose state

Required pattern — **Async Webhook / Polling**:
1. Insert a job row (`receipt_jobs` or analogous) with `status: pending`
2. Edge Function processes the job and writes the result back to the row
3. Frontend subscribes via Supabase Realtime to job status changes

> Origin: Receipt OCR pipeline kept timing out under sync requests. (Legacy: `Boris Rule #13` — engineering version.)

## RULE-WORKTREE-DISCIPLINE

Code in git worktrees is **invisible to main**. Before ending a session that used worktrees:

1. **Commit or cherry-pick** finished work into the target branch, OR
2. **If not ready** → create an MC task (`status: inbox`) with the worktree path and file list
3. **Never** leave code only in a worktree without a trail in MC or git log

> Origin: 2026-04-04. Full Receipt Review UI (`InboxReviewPanel`, ~1000 LOC) was lost because it lived only in a worktree that was deleted. (Legacy: `P0 Rule #12`.)

## RULE-MIGRATION-TRACKING

Every migration file **must** end with a self-register `INSERT` into `migration_log`.

**Checksum rule:** Self-register INSERTs **must** use `checksum = NULL`. A file cannot contain its own content hash (chicken-and-egg). `check_migrations.ts` tolerates NULL checksums — drift detection only fires when a non-NULL stored checksum mismatches the file-content MD5.

**Never use `md5('filename_stem')`** — this produces a value that always mismatches the file-content hash, creating permanent false-positive drift.

Template:
```sql
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  'NNN_description.sql',
  'claude-code',
  NULL,
  'Short description of what this migration does (MC task-id)'
)
ON CONFLICT DO NOTHING;
```

Workflow:
1. Before applying a migration manually: run `check_migrations()` to see the pending list
2. After applying: verify the migration registered itself — `check_migrations()` should show it as `applied`
3. If a migration crashed mid-way: `INSERT` manually with `status='failed'` and `error_msg`

> Origin: Migrations applied in production with no record of which had run. (Legacy: `Boris Rule #16`.) Checksum rule added 2026-04-11 after migrations 094-100 caused permanent drift noise.

---

# PART II — Code Patterns

## RULE-OLLAMA-MODEL-NAME-NORMALIZATION

Ollama model tags are **not safe** to paste directly into anything that becomes part of a database schema, table name, filename, or other identifier. The implicit `:latest` suffix is the trap.

**Canonical rules:**
1. When a model is pulled without an explicit tag, Ollama stores it as `<name>:latest`. API responses return the literal stored tag, not a normalized short name.
2. Downstream tools (e.g. LightRAG) sometimes derive table names, collection names, or cache keys from the model tag. `bge-m3` and `bge-m3:latest` produce **different** table names → silent split-brain: ingests write to one set of tables, queries read another, both succeed with zero data.
3. **Always pin an explicit tag at pull time** (`ollama pull bge-m3:latest` or a versioned tag) AND **match that exact string** in every `.env`, config file, and schema reference.
4. **Verify round-trip before ingesting:** `ollama list` → copy the tag **verbatim** → grep the same string in every config touching that model. If the strings don't byte-match, stop and reconcile before any write.
5. When changing an embedding model name/tag after data exists, the change is **destructive**: existing vector tables are orphaned. Treat it as a migration, not a config edit.

**Scope:** Applies to any integration where a model identifier reaches a schema-sensitive place — LightRAG, custom RAG stores, cache layers, vector DBs, prompt-hash keys.

> Origin: 2026-04-08. LightRAG Phase 1 (task `996f1f86`). Now-deprecated infra; rule kept for any future RAG/embedding work.

## RULE-SUPABASE-UUID-OPERATORS

Supabase JS client **does not support PostgreSQL type casting** (`::text`) in `.filter()` or `.ilike()` method column names. Attempting `.filter("id::text", "like", ...)` on a UUID column throws `operator does not exist: uuid ~~ unknown`.

**For UUID prefix lookup**, use range queries instead:
```typescript
// Pad prefix to 32 hex chars, format as UUID
const lo = (prefix + "0".repeat(32 - prefix.length))
  .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const hi = (prefix + "f".repeat(32 - prefix.length))
  .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

const { data } = await sb.from("table").select("id").gte("id", lo).lte("id", hi).limit(2);
```

**Scope:** Any Supabase JS query that needs to match a UUID by prefix, substring, or pattern. Applies to all MCP servers.

> Origin: 2026-04-12. `get_task` prefix lookup failed every session for weeks — every agent worked around it by manually finding full UUIDs. RULE-SELF-HEAL-TOOLING triggered fix. (MC task `44a6dc52`.)

## RULE-LEARNING-COUNTERS

When code applies or reverses an auto-learned correction (category overrides, supplier aliases, GS1 weight items, or OCR correction rules), it **must** also update the matching counter columns so the system can detect bad-rule learning loops.

### Schema

Counter columns live on **all four self-learning tables**:

| Table | `times_applied` | `times_overridden` | `last_applied_at` | Apply phase wired? |
|---|---|---|---|---|
| `category_overrides` | ✅ (mig 150) | ✅ (mig 166) | ✅ (mig 166) | ✅ via `fn_apply_inbox_overrides` (mig 166) |
| `correction_rules` | ✅ (mig 165) | ✅ (mig 165) | ✅ (mig 165) | ❌ — no apply phase exists in code yet (only post-approval triggers WRITE rows). Counters dormant until ingestion path consults the table. |
| `supplier_aliases` | ✅ (mig 166) | ✅ (mig 166) | ✅ (mig 166) | 🔧 schema-only (apply happens in `nomenclature.ts:resolveSupplierWithProfile`; counter wiring is a follow-up — same pattern as `fn_apply_inbox_overrides`) |
| `gs1_weight_items` | ✅ (mig 166) | ✅ (mig 166) | ✅ (mig 166) | 🔧 schema-only (apply happens in `gs1.ts:matchGS1WeightItem`; counter wiring follow-up) |

`v_learning_metrics` (mig 166) UNIONs across all four tables and aggregates into a single row (`total_rules`, `used_rules`, `sum_applied`, `sum_overridden`, `override_rate_pct`, `last_activity`) for `/health`.

### Architecture: apply-record / approve-increment

Counters must be atomic with the persist of the corrected value. Live apply-phases run in Edge Functions (Deno, async) — fire-and-forget UPDATE from there breaks atomicity if the approval transaction later rolls back. Pattern instead:

1. **Apply phase** — Edge Function (e.g. `ocr-receipt`) records each rule that fired into a per-inbox ledger:
   `receipt_inbox.applied_overrides JSONB` — array of `{ table, rule_id, item_match_key, suggested_flow_type }` entries. **No counter writes here.**
2. **Approve phase** — `fn_approve_receipt_with_learning` (Postgres) calls `fn_apply_inbox_overrides(p_inbox_id, p_payload)` inside the same transaction as `fn_approve_receipt`. The function reads `applied_overrides`, diffs each entry against the approved payload, and atomically:
   - if approved value matches the rule's suggestion → `times_applied++`, `last_applied_at = now()`
   - if admin moved/dropped the item to a different flow_type → `times_overridden++`
3. **Admin override detection** — happens server-side in step 2. No UI code change needed; the modal already submits the approved payload.

If the approval transaction rolls back, counters stay untouched (atomicity).

### Where to call

| Event | Where | Action |
|---|---|---|
| Receipt approval persists corrected expense_ledger | `fn_approve_receipt_with_learning` (Postgres) | calls `fn_apply_inbox_overrides` in same txn — increments `times_applied` / `times_overridden` / `last_applied_at` based on diff against `applied_overrides` ledger |
| Edge Function applies a category override | `services/supabase/functions/_shared/learning.ts:applyCategoryOverrides` | returns `AppliedOverride[]`, caller persists to `receipt_inbox.applied_overrides`. Never increments counters directly. |

Both rules: **never increment on UI hover, never increment outside the approval transaction, never increment fire-and-forget from an Edge Function.**

### Threshold

`v_learning_metrics.override_rate_pct > 30` is the "system is learning the wrong thing" signal. `/health` surfaces it; drill into the offending table:

```sql
SELECT id, match_pattern, flow_type, times_applied, times_overridden,
       100.0 * times_overridden / NULLIF(times_applied, 0) AS override_pct
FROM category_overrides
WHERE times_applied > 0
ORDER BY times_overridden DESC
LIMIT 20;
```

(Swap `category_overrides` for whichever table is dominating overrides.) The top rows are the rules to review or delete.

### Follow-ups

- Wire counter increments for `supplier_aliases` and `gs1_weight_items` (apply phases exist; mirror the `fn_apply_inbox_overrides` pattern with new ledger entries).
- Build apply phase for `correction_rules` (currently only post-approval triggers WRITE to it; nothing READS it during ingestion). Until then its counters are reserved schema.
- mcp-finance `approve-receipt.ts` does not pass `p_inbox_id` to the RPC — MCP-driven approvals bypass the inbox flow entirely, so they have no `applied_overrides` to count. Acceptable: no apply ran for that path either. If MCP starts applying rules in-process, mirror the ledger pattern.

> Origin: 2026-05-04. WS-4 of 75e735e5 (MC `30808669`) added counter schema for `correction_rules`; follow-up `15f2a50f` extended counters to all four learning tables, replaced fire-and-forget increment in `learning.ts` with the apply-record / approve-increment pattern, and added `fn_apply_inbox_overrides` for atomic counter updates inside the approval transaction.

---

# PART III — Frontend Architecture

> Replaces `frontend-rules.md`.

Tech stack: React + Vite + Tailwind CSS v4 + Supabase + TypeScript strict mode.

## Routing
NEVER use `useState` for page switching in ERP. Always use `react-router-dom` with `BrowserRouter` — deep linking is critical for B2B SaaS.

## recharts TypeScript
The `Tooltip` `formatter` prop has strict generics. Never annotate params explicitly — use inferred types and cast with `as` where needed.

## Supabase Joins
When joining across FK relationships (e.g. `capex_transactions.category_code → fin_categories.code`), prefer **2 separate queries + JS join** over implicit `.select('table(col)')` — more predictable across Supabase versions.

## Unused Imports
TypeScript strict mode (`tsc -b`) catches unused imports as errors. Always verify imports before committing.

## Graceful Degradation
Every widget MUST handle 3 states:
- `isLoading` → skeleton
- `error` → error message
- empty data → placeholder

Never let a widget crash on null.

## File Locations
- State: `STATUS.md` (project root)
- Handover: `vault/Handover/HANDOVER.md`
- Dev server: `apps/admin-panel/` (port 5173)

## Git Workflow
Before starting any new major phase or feature, create a new git branch (e.g. `feature/{project}/{description}`). Never commit directly to `main` during active development. See `operational-rules.md` § Session Handoff Protocol § Git State Protocol for branch checks.

## BOM Hub Filtering (→ RULE-BOM-PREFIX-FILTER)
See § RULE-BOM-PREFIX-FILTER above — filter strictly by product_code prefix.

---

# Cross-References

- Foundational rules, agents, routing, sessions → `operational-rules.md`
- Migration spec/process → `docs/plans/spec-migration-tracking.md`
- AI-Native Ops modernization → `docs/plans/spec-ai-native-ops.md`
- DB schema → `vault/Architecture/Database Schema.md`
- Architecture notes → `vault/Architecture/*.md`
