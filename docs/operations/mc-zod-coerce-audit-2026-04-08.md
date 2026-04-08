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
