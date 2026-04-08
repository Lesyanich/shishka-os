# MC RPC Zod Schema Audit — Numeric Coercion (2026-04-08)

> MC task: 979ed751-9849-41ea-b70d-6d487113dbc5
> Scope: services/mcp-mission-control/src/index.ts — all tool registrations
> Trigger: COO session 7 hit "expected number, received string" on `list_comments(limit=20)`

## Problem

Some MCP clients serialize numeric tool arguments as JSON strings. `z.number()` rejects
strings. Switching to `z.coerce.number().int()` accepts both native numbers and numeric
strings, still rejects non-numeric input, and enforces integer semantics (no fractional
`limit`s).

## Audit results

Every `server.tool(...)` registration in `src/index.ts` was reviewed for numeric fields.

| Tool                | Numeric field(s)          | Before              | After                         | Status |
|---------------------|---------------------------|---------------------|-------------------------------|--------|
| `emit_business_task`| `related_ids` values (number variant) | `z.union([string, number, boolean])` | unchanged | OK — freeform bag, already accepts multiple types |
| `list_tasks`        | `limit`                   | `z.number().min(1).max(50).default(20)` | `z.coerce.number().int().min(1).max(50).default(20)` | FIXED |
| `get_task`          | —                         | —                   | —                             | n/a |
| `update_task`       | `related_ids` values      | union of string/number/boolean | unchanged | OK |
| `create_sprint`     | —                         | —                   | —                             | n/a |
| `list_sprints`      | `limit`                   | `z.number().min(1).max(50).default(10)` | `z.coerce.number().int().min(1).max(50).default(10)` | FIXED |
| `update_sprint`     | —                         | —                   | —                             | n/a |
| `assign_to_sprint`  | —                         | —                   | —                             | n/a |
| `add_comment`       | —                         | —                   | —                             | n/a |
| `list_comments`     | `limit`                   | `z.number().min(1).max(100).default(20)` | `z.coerce.number().int().min(1).max(100).default(20)` | FIXED (primary) |
| `check_migrations`  | —                         | —                   | —                             | n/a |
| `generate_status`   | —                         | —                   | —                             | n/a |
| `get_project_state` | —                         | —                   | —                             | n/a |

Three tools fixed. Ten tools had no scalar numeric arguments and need no change.

## Verification

- `npm run build` — clean (tsc)
- `npm run lint` — clean (eslint)
- `npm run test` — 12/12 pass (vitest)
- `list_comments(task_id, limit=20)` with integer: now accepted (primary regression)
- `list_comments(task_id, limit="20")` with string: now coerced to 20 (compat with
  serializing clients)
- `list_comments(task_id, limit=0)` / `limit=150`: still rejected by min/max

## Future guardrail

When adding any new MCP tool with a numeric argument, prefer
`z.coerce.number().int()` over `z.number()` unless there is a concrete reason to
reject numeric strings. Zod 4 `coerce` has well-defined semantics — it uses
`Number()` and then runs downstream checks — so `.int().min().max()` still apply.

## 2026-04-08 extension — array/record coerce

> MC orphan-host: 355bb967 comments (COO session 9, bug widened mid-session)
> Sibling fix follows the exact shape of this audit, extended to non-primitive fields.

COO session 9 discovered the same bug class on array and record fields:

| RPC                  | Field                     | Broken                                  |
|----------------------|---------------------------|-----------------------------------------|
| `update_task`        | `tags`                    | array → "expected array, received string"   |
| `update_task`        | `context_files`           | array → "expected array, received string"   |
| `update_task`        | `related_ids`             | record → "expected record, received string" |
| `emit_business_task` | `tags`                    | array → "expected array, received string"   |
| `emit_business_task` | `related_ids`             | record → "expected record, received string" |

Zod has no `z.coerce.array()` / `z.coerce.record()`, so the fix uses
`z.preprocess(parseJsonIfString, ...)` via shared helpers in
`src/lib/zod-helpers.ts`:

- `jsonArray(inner)` wraps `z.array(inner)` with a string → `JSON.parse` preprocessor
- `jsonRecord(key, value)` wraps `z.record(key, value)` similarly
- On parse error the helper returns the original string unchanged so Zod
  emits a meaningful "expected array, received string" error instead of a
  cryptic SyntaxError

Applied to the 5 fields above. Unit tests in `src/__tests__/zod-helpers.test.ts`
cover: native payload, stringified payload, inner-schema enforcement,
non-object/non-array rejection, and `.optional()` composition.

**Future guardrail:** any new non-primitive MCP tool field must use
`jsonArray` / `jsonRecord` unless the caller can guarantee the MCP transport
layer will not stringify. Add to the schema audit whenever a new tool ships.
