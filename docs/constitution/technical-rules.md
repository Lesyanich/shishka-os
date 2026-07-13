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

## RULE-MCP-INDEX-INTEGRITY

Every file imported in `services/mcp-*/src/index.ts` **must** exist on the same commit that introduces the import. Orphan imports are a P0 break — the MCP server fails to load with `ERR_MODULE_NOT_FOUND` and takes down every tool it exposes.

When a PR adds, removes, or renames a file under `services/mcp-*/src/tools/` (or any directory imported by `index.ts`), the same commit **must**:

1. Add / remove / rename the corresponding `import` line at the top of `index.ts`
2. Add / remove / rename the corresponding `server.tool(...)` or `lazyScraper(...)` registration
3. Pass `npm run build` (or `tsc -b`) locally before commit — a failing build is not a "fix later" item, it is a blocker

**Reviewer gate:** Before approving a PR that touches any file under `services/mcp-*/src/`, verify the CI check `MCP <Server> (tsc + lint)` reports SUCCESS on the **final** commit of the branch. A green check on an earlier commit is not sufficient — rebases and last-minute drops can re-break the build.

**Lazy-loader exception (PR #253 pattern):** A scraper file imported via `lazyScraper("./tools/X.js", "exportName")` may legitimately be absent at module-load time — the helper defers the dynamic `import()` to first invocation. But the registered string still needs to resolve at runtime: a missing file will throw on the first tool call and the user-facing error will be opaque. Treat any `lazyScraper` registration whose target file is absent on `main` as a P1 cleanup task, not a normal state.

**When the rule fires hardest:**
- PR removes a scraper / tool file but leaves its import (the PR #252 failure mode)
- PR renames a tool file in one commit and updates the import in a separate commit on the same branch — squash-merge can hide the break in the intermediate state
- PR adds a `server.tool(...)` registration referencing an export that does not exist in the imported module

> Origin: 2026-05-22. PR #252 (commit `aae9053`) merged with `services/mcp-chef/src/tools/search-makro-catalog.ts` deleted but `import { searchMakroCatalog } from "./tools/search-makro-catalog.js"` still in `services/mcp-chef/src/index.ts`. Chef MCP failed to start with `ERR_MODULE_NOT_FOUND` for ~24 hours. PR #253 introduced the `lazyScraper()` resilience pattern; this rule formalizes the merge-gate so resilience is not the only line of defense.

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

## RULE-DEPLOY-MAP

The live customer site `shishka.health` is served by the Vercel project **`shishka-web`**, which builds the **`Lesyanich/shishka-health`** repo (`main`) — **not this repo**. The `shishka-os` Vercel project builds `apps/admin-panel` only. Full topology: `docs/operations/deploy-map.md`.

1. Agents **never** run `vercel deploy` / `vercel --prod` (CLI upload) or re-point domains — live-site changes ship only via git push to `shishka-health` `main`. Prod rollback = **Promote** a previous git deployment (CEO, or agent on explicit CEO instruction naming the project).
2. Before ANY deploy/rollback/site-incident work: read `docs/operations/deploy-map.md` and follow its runbook **symptom-first** (domain → project → deployment source → only then git).

> Origin: 2026-07-11. A parallel session shipped `shishka-os/apps/web` onto the live-site project via CLI `vercel deploy`, replacing shishka.health entirely; recovery = dashboard Promote of the last git deploy (`10a01aa`). Post-mortem in the deploy map.

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

## RULE-DESIGN-SYSTEM

The brand design system is **owned by the customer-site repo `shishka-health`**, not by the admin panel. Its home:
- `design-system/index.html` — living style guide. Renders every `.shk-*` component (buttons, badges, tabs, dish cards, hero, order FAB, dialog) as a **real component** beside its className recipe + source file. It `<link>`s the real `src/styles/` CSS, so it **cannot drift** from production. Open it in a browser — zero build, zero subscription. The factory-floor blueprint every worker reads from the same wall.
- `design-system/MASTER.md` — brand rules, palette, typography, component contract, anti-patterns, a11y checklist.

Brand DNA: royal-green `#1E3903` canvas · cream `#FBF8F0` text · spice-red `#B62A23` CTA · gold `#F0CE83` prices · SF Pro / Albert Sans · "from the SOIL to the SOUL".

1. **Check the guide before any front-end work** (site or admin). Reuse a `.shk-*` primitive; do not reinvent one. Reference **semantic tokens** (`var(--accent)`, `var(--royal-green)`, `var(--menu-price)`), never raw hex.
2. **Every PR that touches UI updates `design-system/index.html` in the same commit.** New primitive/variant → new section with its recipe + source. Design system and code ship together or not at all.
3. **Token source of truth** = `shishka-health/src/styles/tokens/` (`colors.css`, `fonts.css`, `spacing.css`, `theme-royal.css`).

**Admin panel (this repo):** its `/menu` prototype uses default-Tailwind styling — that is NOT the design system. The admin is slated to be **re-skinned onto this brand**: the token block is ported into `apps/admin-panel/src/index.css` `@theme` (so `bg-royal-green`, `text-honey-300` utilities resolve), and components are matched to the guide. Until then, new admin UI should already lean on these brand tokens.

> Origin: 2026-06-28. CEO mandate — design system as code, not SaaS. Built from the live shishka.health tokens (the admin's own styling was default-Tailwind, off-brand). "A factory floor blueprint that every worker reads from the same wall." Plan: maintain in shishka-health, port to admin.

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

## RULE-GIT-HYGIENE

> One rule for how work enters `main` cleanly. Enforced in three layers so the
> CEO never has to police it by hand or by prompt. Plain-language primer for the
> CEO: `docs/guides/git-workflow-guide.md`.

**The six practices**

1. **Branch, never `main`.** All work goes on a branch named
   `feature/{project}/{description}` — project ∈ `admin | web | app | agents |
   security | tooling | docs | cleanup` (also allowed: `fix|chore|docs|refactor|
   perf|security/…`). Auto-generated `claude/*` names carry no meaning — rename
   before the first push (`git branch -m feature/…`; safe while no PR exists).
2. **Never commit or push to `main`.** `main` ships to production and is PR-only.
3. **Verify before merge.** Build + prove it works (VERIFY-BEFORE-DONE) — not just
   "tests pass". A merge-then-revert (e.g. PR #493) is the failure this prevents.
4. **One PR = one intent, kept small.** A PR you can't skim in ~2 min hides risk
   and is painful to revert.
5. **Squash on merge.** One PR → one commit on `main`. Consistent, linear history.
6. **Delete the branch after merge.** No merged-but-undeleted clutter.

**Enforcement layers**

| Layer | Mechanism | Strength |
|---|---|---|
| 1. Rule | this section + the CEO guide | agents read it |
| 2. Local hook | `.claude/hooks/git-guard-pretool.sh` (PreToolUse/Bash): **hard-blocks** local `main` mutations (commit/merge/cherry-pick/revert) and any push targeting `main`; **warns** on off-convention branch names (only until the branch has an upstream — after the first push a rename would break the PR) | blocks any Claude session in the terminal |
| 3. GitHub settings | branch protection on `main` (block direct push), squash-only merge, required CI checks, auto-delete head branches | server-side; applies to everyone, cannot be bypassed by a prompt |

Layer 3 is set once in the GitHub UI (the proxy blocks settings writes from
agents) — see the checklist in the CEO guide. Layers 1–3 are complementary; all
three should be on.

**Layer-3 caveat — the sheriff.** The data-health sheriff is a scheduled Claude
session that commits its report straight to `main` (e.g. `6015194`). Before
enabling require-PR on `main`, either add the committing actor to the ruleset
**bypass list** or migrate the sheriff to PR flow — otherwise its next run fails
at the server with no escape hatch.

**Escape hatch (layer 2 only).** Sanctioned automation that must write to
`main` (e.g. the sheriff) **prefixes the command**: `SHISHKA_ALLOW_MAIN=1 git
commit …`. The guard greps the prefix out of the command text (an env var
exported inside the Bash call never reaches the hook process) and also honours
it in its own env for cron-configured runners. Never use it interactively —
deny messages deliberately do not spell it out.

**Visibility.** `sh scripts/git-hygiene-report.sh` buckets remote branches
(merged-not-deleted / stale / live) on demand, so clutter is seen, not silently
accumulated.

> Origin: 2026-07-13. CEO branch/PR-hygiene review found 248 remote branches
> (49 merged-but-undeleted, ~167 abandoned, 11 stale PRs open >1 month) and a
> merge-then-revert incident (PR #493). Codified so it self-enforces.

See `operational-rules.md` § Session Handoff Protocol § Git State Protocol for branch checks.

## BOM Hub Filtering (→ RULE-BOM-PREFIX-FILTER)
See § RULE-BOM-PREFIX-FILTER above — filter strictly by product_code prefix.

## RULE-REALTIME-LIST-HOOK

Any admin-panel hook that backs a live list/table (fetch + Supabase realtime + mutations) **must not** cause a reload/flicker. Flicker = **any fetch that calls `setIsLoading(true)` while the list is already populated.** There are two triggers, and both are banned:

1. **A mutation that does `await fetchData()`** — the write already succeeded; a full refetch clears the table to a spinner and resets the just-edited row for a frame.
2. **A blind `event:'*'` realtime callback that re-runs the (non-silent) fetch** — it catches the echo of your own write and fires a *second* full refetch. A multi-row transaction fires one per row.

**The canonical pattern (model: `hooks/useReceiptInbox.ts`):**

- **`fetchData({ silent }: { silent?: boolean } = {})`** — `if (!silent) setIsLoading(true)`. The spinner is for the **first mount only** (and explicit filter changes). Background reconciles are silent.
- **Mutations update local state OPTIMISTICALLY** — targeted `setState` (merge / insert / remove the one changed row), **never** `await fetchData()`. If the write returns the row (`.select().single()`) or you know exactly what changed, patch it in place. Re-sort to match the fetch's `ORDER BY`. Honour any active client-side filter (drop the row if it no longer matches).
- **Realtime drives a SILENT, COALESCED refetch** via the shared **`hooks/useCoalescedRealtimeRefetch.ts`** helper — debounces a burst (multi-row tx / echo) into one `() => fetchData({ silent: true })`. This is the reconcile path for other clients' writes and server-computed columns.

**JS-joined fetches** (a row enriched from several tables — `supplier_name`, `line_count`, nomenclature name, a `v_*` view, `location_name`): do **not** hand-enrich the raw realtime payload (it lacks those fields — fragile). Put targeted patches in the **mutations** (where the changed fields are known) and let the silent-coalesced refetch reconcile the joins. A trigger-assigned code / brand-new joined row that can't be built locally → a single `await fetchData({ silent: true })` (no realtime double-fire when the hook has no subscription).

**FORBIDDEN:** `() => { fetchX() }` (blind, non-silent) inside a `.on('postgres_changes', …)` callback; `await fetchData()` in a mutation success path; a hand-rolled `supabase.channel(...).on(...).subscribe()` block in a list hook when the coalesced helper fits.

> Origin: 2026-07-08 (MC 90e31026). CEO: «такие проблемы возникают не только в этом разделе, я уже не первый раз делаю подобный фикс». ~24 of 27 realtime consumers carried the anti-pattern. Fixed the 12 worst; helper + this rule prevent recurrence.

---

# Cross-References

- Foundational rules, agents, routing, sessions → `operational-rules.md`
- Migration spec/process → `docs/plans/spec-migration-tracking.md`
- AI-Native Ops modernization → `docs/plans/spec-ai-native-ops.md`
- DB schema → `vault/Architecture/Database Schema.md`
- Architecture notes → `vault/Architecture/*.md`
