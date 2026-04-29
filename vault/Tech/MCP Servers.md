---
title: MCP Servers
type: page
tags: [tech, mcp, agents]
date: 2026-04-29
status: active
related:
  - "[[Tech/]]"
  - "[[Tech/Agent System]]"
  - "[[Database/Domain Contracts]]"
---

# MCP Servers

The Model Context Protocol servers that mediate between AI agents and Shishka systems. Each server owns a domain (per [[Database/Domain Contracts]]) and exposes a set of tools the agents call.

## Registered servers

The MCPs registered in `.claude/.mcp.json` (the ones Claude Code actually loads):

```json
{
  "mcpServers": {
    "shishka-mission-control": {
      "command": "node",
      "args": ["services/mcp-mission-control/dist/index.js"]
    },
    "shishka-graphify": {
      "command": "node",
      "args": ["services/mcp-graphify/dist/index.js"]
    }
  }
}
```

`mcp-chef` and `mcp-finance` exist as **services** under `services/` but are not registered as Claude-Code MCPs in the current `.mcp.json` — they're invoked from the admin panel via Vercel API routes (`apps/admin-panel/api/chef/...`) and other internal call paths.

## `shishka-mission-control` (the central nervous system)

Source: `services/mcp-mission-control/`. Owns: `business_tasks`, `business_initiatives`, `sprints`, `task_comments`.

### Read tools
- `get_task(task_id)` — full task with initiative, parent, comments
- `list_tasks(status?, domain?, priority?, ...)` — filtered listing
- `list_comments(task_id)` — comments on a task
- `list_sprints(...)` — sprint listing
- `generate_status()` — system-wide status report
- `get_project_state()` — domain-level state
- `check_migrations()` — verify production schema

### Write tools
- `emit_business_task(...)` — create task with validation
- `update_task(task_id, ...)` — update status / priority / notes / `related_ids` (merge, not replace)
- `add_comment(task_id, author, body)` — add comment (limit 32k chars)
- `assign_to_sprint(task_id, sprint_id)`
- `create_sprint(...)`, `update_sprint(...)`

Every agent uses MC tools — these are the most-called MCP tools in the system.

## `shishka-graphify` (knowledge graph queries)

Source: `services/mcp-graphify/` (B-2 deliverable). Owns: read-only access to `apps/admin-panel/public/graph.json` + `graph-analytics.json`.

### Tools

| Tool | Input | Returns |
|---|---|---|
| `graphify_query_topic` | `{ keywords, limit? }` | top-N relevant nodes + 1-paragraph summaries |
| `graphify_neighborhood` | `{ node_id, depth? }` | k-hop subgraph around a node |
| `graphify_god_nodes` | `{ category?, limit? }` | most-central nodes (high degree) |
| `graphify_communities` | `{ category? }` | community clusters |

**Goal**: 10–20× cheaper architectural queries for agents (200–500 tokens of pre-clustered structure vs. 5–20K tokens of raw file reads). When an agent asks "where is receipt parsing in the codebase?" it should reach for `graphify_query_topic` first, fall through to file `Read` only if the structure is unfamiliar.

## `mcp-chef` (chef domain — internal service)

Source: `services/mcp-chef/`. Owns: `nomenclature`, `bom_structures`, `recipes_flow`, `equipment`, `supplier_catalog`, `production_orders`, `inventory_levels`, `waste_log`.

Tools cover the chef domain:

- `create_nomenclature`, `update_nomenclature`, `delete_nomenclature`
- `create_bom_lines`, `update_bom_line`
- `create_recipe_flow_step`, `update_recipe_flow_step`
- `update_equipment` (also exposed in admin Equipment page)
- `create_supplier_catalog_entry`, `update_supplier_catalog_entry`
- `record_production_order`, `record_waste`
- Plus computed-cost rollups via the `fn_compute_food_cost` RPC

Currently **invoked from admin via Vercel API routes** rather than registered as a Claude-Code MCP. Claude Code agents that need chef writes use the Mission Control task system to coordinate, with the admin or a chef-specific session executing the writes.

## `mcp-finance` (finance domain — internal service)

Source: `services/mcp-finance/`. Owns: `financial_transactions`, `receipt_jobs`, `receipt_inbox`, `capex_assets`, `capex_transactions`.

Tools:

- `parse_receipt(receipt_id)` — calls Gemini OCR, populates `receipt_jobs`
- `classify_line(line_id, category, sub_category)` — manual / agent classification
- `approve_receipt(receipt_id)` — wraps `fn_approve_receipt` RPC; auto-creates `capex_assets` + `equipment` for CAPEX lines
- `create_capex_asset`, `update_capex_asset`, `record_capex_disposal`
- `manage_capex_assets` — bulk operations (currently has a known bug — MC `3760af53`)
- `update_equipment` — for the equipment row created by `fn_approve_receipt` to be edited via the finance side too

Same pattern as `mcp-chef` — invoked from admin / Vercel API routes.

## Why some MCPs are CC-registered and some aren't

| MCP | Claude-Code-registered? | Why |
|---|---|---|
| `shishka-mission-control` | ✅ Yes | Used directly by every Claude Code session for task coordination |
| `shishka-graphify` | ✅ Yes | Cross-cutting: every agent needs to query the codebase graph |
| `shishka-chef` | ❌ No (today) | Chef domain writes are coordinated through MC tasks; admin/API does the writes |
| `shishka-finance` | ❌ No (today) | Same pattern as chef |

This is a **deliberate** boundary — agents don't get direct chef/finance write privileges from Claude Code; they request the work via MC, and a controlled execution path (admin or a focused `/finance` session) does the actual write. Reduces blast radius if an agent goes off-track.

## Adding a new MCP

If you build a new MCP server (say, `mcp-marketing`):

1. Scaffold under `services/mcp-marketing/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. Implement tools using the `@modelcontextprotocol/sdk` pattern — see `services/mcp-mission-control/src/index.ts` as reference
3. Build → outputs to `dist/`
4. Decide registration:
   - Cross-cutting / agent-direct → register in `.claude/.mcp.json`
   - Domain-internal → leave unregistered, invoke via API routes
5. Document in this catalog

## See Also

- [[Tech/Agent System]] — multi-agent coordination via these MCPs
- [[Database/Domain Contracts]] — table-ownership matrix
- [[Database/RPC Catalog]] — Postgres functions wrapped by these MCPs
- `services/mcp-*/README.md` — per-server documentation
- `docs/plans/_archive/spec-mcp-mission-control.md` — original MC MCP spec
