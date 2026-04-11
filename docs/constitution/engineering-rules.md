# Engineering Rules — Code & Database Discipline

> Priority: Core Rules > **Engineering Rules (this file)** > Agent Rules > Module rules > Task context
>
> Replaces legacy `boris-rules.md`. All references to "Boris Rule #N" map to the semantic IDs below.
>
> Audience: any agent that touches code, the database, or the git tree.

---

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

---

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

---

## RULE-DB-SCHEMA-DOCS

When any migration creates or alters a table / function / trigger / enum, the agent **must** update `vault/Architecture/Database Schema.md`:

1. Keep the Mermaid `erDiagram` block in sync with all current tables and FK relationships
2. Keep the Tables index up to date: `Table | PK | Key Columns | FKs | Migration`
3. Keep the RPCs & Triggers table up to date

> Origin: Schema doc drift — production tables existed that no doc mentioned. (Legacy: `Boris Rule #10`.)

---

## RULE-COMMIT-GATE

**Never** run `git push` until the following are all true:

1. The MC task for this work is updated (status, notes) — see `agent-rules.md` → `RULE-TASK-CLOSURE`
2. `vault/Architecture/Database Schema.md` is updated if any migration touched tables, policies, RPCs, or ENUMs
3. The relevant architecture note (mapping below) is updated if it exists
4. `STATUS.md` is **not** edited manually — it auto-generates on commit (see `core-rules.md` → `RULE-COMPUTED-STATUS`)
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

---

## RULE-TXN-DATE-INTEGRITY

**Never** overwrite historical `transaction_date` values. Dates come **strictly** from source documents (receipt, invoice).

`CURRENT_DATE` is acceptable **only** as an absolute last-resort fallback in the RPC, when the frontend fails to provide a date. Migrations **must never** set `transaction_date = CURRENT_DATE` to "fix" sorting — that violates ERP audit standards and corrupts the historical record.

> Origin: ERP audit — sorting was "fixed" by overwriting dates, history was destroyed. (Legacy: `Boris Rule #12`.)

---

## RULE-ASYNC-LLM-PATTERN

Long-running AI tasks (>30s), such as Vision OCR for long receipts, **must not** rely on synchronous HTTP responses.

Constraints:
- Supabase Edge Functions: 150s request idle timeout, 200ms CPU limit
- Synchronous responses for slow LLM jobs will time out and lose state

Required pattern — **Async Webhook / Polling**:
1. Insert a job row (`receipt_jobs` or analogous) with `status: pending`
2. Edge Function processes the job and writes the result back to the row
3. Frontend subscribes via Supabase Realtime to job status changes

> Origin: Receipt OCR pipeline kept timing out under sync requests. (Legacy: `Boris Rule #13` — engineering version. The agent-tracking version of `#13` is now `RULE-TASK-CLOSURE` in `agent-rules.md`.)

---

## RULE-WORKTREE-DISCIPLINE

Code in git worktrees is **invisible to main**. Before ending a session that used worktrees:

1. **Commit or cherry-pick** finished work into the target branch, OR
2. **If not ready** → create an MC task (`status: inbox`) with the worktree path and file list
3. **Never** leave code only in a worktree without a trail in MC or git log

> Origin: 2026-04-04. Full Receipt Review UI (`InboxReviewPanel`, ~1000 LOC) was lost because it lived only in a worktree that was deleted. (Legacy: `Boris Rule #12` in `p0-rules.md` — note: this is a different `#12` than the `txn-date-integrity` one in `boris-rules.md`. The numbering chaos is exactly why we switched to semantic IDs.)

---

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

> Origin: Migrations applied in production with no record of which had run. (Legacy: `Boris Rule #16` in `p0-rules.md`.) Checksum rule added 2026-04-11 after migrations 094-100 caused permanent drift noise.

---

## RULE-OLLAMA-MODEL-NAME-NORMALIZATION

Ollama model tags are **not safe** to paste directly into anything that becomes part of a database schema, table name, filename, or other identifier. The implicit `:latest` suffix is the trap.

**Canonical rules:**
1. When a model is pulled without an explicit tag, Ollama stores it as `<name>:latest`. API responses return the literal stored tag, not a normalized short name.
2. Downstream tools (e.g. LightRAG) sometimes derive table names, collection names, or cache keys from the model tag. `bge-m3` and `bge-m3:latest` produce **different** table names → silent split-brain: ingests write to one set of tables, queries read another, both succeed with zero data.
3. **Always pin an explicit tag at pull time** (`ollama pull bge-m3:latest` or a versioned tag) AND **match that exact string** in every `.env`, config file, and schema reference.
4. **Verify round-trip before ingesting:** `ollama list` → copy the tag **verbatim** → grep the same string in every config touching that model. If the strings don't byte-match, stop and reconcile before any write.
5. When changing an embedding model name/tag after data exists, the change is **destructive**: existing vector tables are orphaned. Treat it as a migration, not a config edit.

**Scope:** Applies to any integration where a model identifier reaches a schema-sensitive place — LightRAG, custom RAG stores, cache layers, vector DBs, prompt-hash keys.

> Origin: 2026-04-08. LightRAG Phase 1 (task `996f1f86`). `.env` had `EMBEDDING_MODEL=bge-m3`, Ollama actually stored `bge-m3:latest`, LightRAG derived table names from the returned tag. Ingest wrote to `..._bge_m3_latest_*` tables, queries hit `..._bge_m3_*` tables → 0 results despite "successful" ingest. Option E graph layer recovery depended on catching this before the next reingest wiped the evidence.

---

## RULE-MINIMAL-CORRECT-CHANGE

Every code change must be:

1. **Minimal** — touch only files listed in the task scope (or handoff packet `Scope — files`). If you need to change a file not in scope, STOP: either expand scope via MC comment or log a separate task (`RULE-BACKLOG-FIRST`).

2. **Root-cause** — fix the cause, not the symptom. No `// TODO: fix later` hacks, no `try/catch` that swallows errors to make tests pass, no hardcoded values that paper over a broken query. If the root cause is too deep for this task, log a new task with the real fix and document the temporary workaround explicitly in MC notes.

3. **Simple** — if there's a direct solution and an abstract one, choose direct. Create an abstraction only when the same pattern appears 3+ times. "Might need it later" is not a reason to abstract now.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Simplicity First", "No Laziness", and "Minimal Impact" principles. Addresses observed pattern where agents over-engineer solutions, touch files outside scope, or apply temporary fixes that become permanent.

---

## Cross-References

- DB SSoT and UUID rules → `core-rules.md` (`RULE-SUPABASE-SSOT`, `RULE-UUID-COMPLIANCE`)
- Frontend-specific rules → `frontend-rules.md`
- Context loading (project detection, modules, dead zones) → `context-routing.md`
- Migration spec/process → `docs/plans/spec-migration-tracking.md`
- AI-Native Ops modernization → `docs/plans/spec-ai-native-ops.md`
