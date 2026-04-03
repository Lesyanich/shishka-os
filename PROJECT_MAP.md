# Shishka OS — Project Map

> Universal entry point for any LLM or developer. Read this first.

## What is this?

Shishka Healthy Kitchen (Koh Samui, Thailand) — ERP/KDS ecosystem for a healthy restaurant.
Multi-agent architecture: AI agents handle finance, recipes, procurement; humans manage via admin panel.

## Directory Structure

```
shishka-os/
├── docs/           Brains: rules, domain knowledge, modules, phase history
├── agents/         Brains: agent prompts, guidelines, domain files
├── apps/           Hands: frontend applications (React + Vite)
├── services/       Hands: backend (Supabase), MCP servers, GAS
├── tools/          Hands: standalone utilities (parsers, sync scripts)
├── vault/          Knowledge base (Obsidian vault)
└── .secrets/       Credentials (gitignored)
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Lego BOM** | Menu modules: RAW (raw ingredient) -> PF (semi-finished) -> MOD (topping) -> SALE (dish) |
| **SSoT** | Supabase PostgreSQL is the single source of truth |
| **SYRVE** | External POS system of record (inventory, BOM, sales) |
| **MCP** | Model Context Protocol — how AI agents interact with the system |

## Active Projects

| Project | Path | Status |
|---------|------|--------|
| Admin Panel | `apps/admin-panel/` | Active (Phase 17) |
| Web (public) | `apps/web/` | Planned |
| Mobile App | `apps/app/` | Planned |

## AI Agents

| Agent | Brains | Hands (MCP) |
|-------|--------|-------------|
| Chef | `agents/chef/` | `services/mcp-chef/` |
| Finance | `agents/finance/` | `services/mcp-finance/` |
| Invoice Parser | `agents/invoice-parser/` | (uses Finance MCP) |

## Next Steps

- Read `STATUS.md` for current state and active tasks
- Read `TECH_STACK.md` for infrastructure details
- Read `docs/constitution/p0-rules.md` for immutable rules
