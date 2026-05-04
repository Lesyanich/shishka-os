---
title: Database RPC Catalog
type: page
tags: [database, rpc, functions]
date: 2026-04-29
status: active
related:
  - "[[Database/]]"
  - "[[Tech/MCP Servers]]"
  - "[[Finance/Receipt Routing]]"
---

# Database RPC Catalog

Postgres functions exposed via Supabase RPC and called by MCP servers / the admin panel. Each MCP owns the functions in its domain. Implementations live in numbered migrations under `services/supabase/migrations/`.

## Finance domain (mcp-finance)

| Function | Migration | Purpose |
|---|---|---|
| `fn_approve_receipt(receipt_id uuid)` | 164 | Approve a parsed receipt → posts to ledger, auto-creates capex_assets + equipment for CAPEX lines, updates purchase_logs + WAC for COGS lines |
| `fn_classify_receipt_line(line_id uuid)` | various | Run auto-classification on a single receipt line (auto-applied by adaptive learning) |
| `fn_record_capex_disposal(asset_id uuid)` *(planned)* | TBD | Record asset disposal / scrap event |

`fn_approve_receipt` is the core finance RPC. See [[Equipment/CapEx Flow]] for the auto-create flow it drives.

## Chef domain (mcp-chef)

| Function | Migration | Purpose |
|---|---|---|
| `fn_create_nomenclature(payload jsonb)` | various | Create a new product (RAW / PF / MOD / SALE) with validations |
| `fn_create_bom_lines(parent_id uuid, lines jsonb)` | various | Bulk-insert BOM tree for a SALE / PF |
| `fn_compute_food_cost(product_id uuid)` | various | Roll up cost from BOM + WAC |
| `fn_update_equipment(equipment_id uuid, patch jsonb)` | recent | Update equipment row (also exposed as a chef MCP tool) |
| `fn_check_circular_bom(parent uuid, child uuid)` | various | Reject cyclic BOM edges |

Most chef functions are wrapped by MCP tools (`mcp-chef.create_nomenclature`, etc.) — see [[Tech/MCP Servers]].

## Mission Control domain (mcp-mission-control)

| Function | Migration | Purpose |
|---|---|---|
| `fn_emit_business_task(payload jsonb)` | 091 | Create a `business_tasks` row with validation, defaults |
| `fn_update_task(task_id uuid, patch jsonb)` | 091 | Update a task; merges `related_ids` non-destructively |
| `fn_get_task(task_id uuid)` | 091 | Read task + initiative + parent + comments in one call |
| `fn_list_tasks(filters jsonb)` | 091 | Filtered task listing |
| `fn_assign_to_sprint(task_id uuid, sprint_id uuid)` | 093 | Sprint assignment |
| `fn_check_migrations()` | various | Dev helper — verify production schema matches expected |

## Brain domain (analytics)

| Function | Migration | Purpose |
|---|---|---|
| `brain_query_log` view / aggregations | 103 | Telemetry for the Graphify / brain query system |

## Convention — function naming

```
fn_<verb>_<object>          fn_approve_receipt, fn_create_nomenclature, fn_compute_food_cost
fn_record_<event>           fn_record_capex_disposal
fn_check_<invariant>        fn_check_circular_bom, fn_check_migrations
fn_get_/_list_<thing>       fn_get_task, fn_list_tasks
fn_<bool_question>          (for predicates returning boolean)
```

## How MCP tools call RPCs

A typical MCP tool wraps a single RPC + does input validation:

```ts
// services/mcp-mission-control/src/tools/update_task.ts (sketch)
export async function update_task(args: { task_id: string, patch: object }) {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('fn_update_task', {
    task_id: args.task_id,
    patch: args.patch,
  })
  if (error) throw new MCPError('update_task failed', error)
  return data
}
```

The TypeScript layer enforces input shape; the SQL function enforces business rules (e.g. you can't move a task to status=`done` without `notes`).

## Admin-panel RPC calls

The admin panel calls RPCs directly via `supabase.rpc(...)` — RLS still applies. Examples:

- `apps/admin-panel/src/api/brainCost.ts` — calls `brain_query_log` view
- `apps/admin-panel/src/api/apiCost.ts` — calls API cost log RPCs
- Receipt approval — calls `fn_approve_receipt` from `apps/admin-panel/src/pages/ReceiptInbox.tsx`

## Adding a new RPC

1. Write the function in a migration: `CREATE OR REPLACE FUNCTION fn_my_thing(...) RETURNS ... LANGUAGE plpgsql AS $$ ... $$;`
2. Apply migration → function exists in DB
3. Wrap in an MCP tool (if agent-callable) OR call directly from admin panel via `supabase.rpc('fn_my_thing', {...})`
4. Add to this catalog page

## See Also

- [[Database/Migrations]] — where RPCs are defined
- [[Database/RLS Policies]] — security around RPC execution
- [[Tech/MCP Servers]] — the consumers of these RPCs
- [[Finance/Receipt Routing]] — `fn_approve_receipt` in context
