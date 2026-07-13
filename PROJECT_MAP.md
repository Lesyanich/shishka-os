# Shishka OS — Project Map

> Universal entry point for any LLM or developer. Read this first.

## What is this?

Shishka Healthy Kitchen (Rawai, Phuket, Thailand) — ERP/KDS ecosystem for a healthy restaurant.
Multi-agent architecture: AI agents handle finance, recipes, procurement; humans manage via admin panel.

## Directory Structure

```
shishka-os/
├── docs/           Brains: constitution (rules), modules, business domains, plans, projects
├── agents/         Brains: agent prompts (chef, finance, coo, lawyer, procurement, strategy, tech-lead, designer)
├── apps/           Hands: admin-panel (React+Vite → Vercel), kds, web
├── services/       Hands: supabase (migrations, edge fns), MCP servers (chef, finance, mission-control, graphify), print-bridge
├── tools/          Hands: standalone utilities (parsers, sync scripts)
├── scripts/        Repo automation (status generation, hook helpers)
├── packages/       Shared packages
├── supabase/       Supabase CLI config
├── knowledge/      AI-learning notes, phase knowledge
├── design/         Design assets (labels)
├── vault/          Knowledge base (Obsidian vault)
├── .claude/        Claude Code config: skills, commands, hooks, settings
└── .secrets/       Credentials (gitignored)
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Lego BOM** | Menu modules: RAW (raw ingredient) -> PF (semi-finished) -> MOD (topping) -> SALE (dish) |
| **SSoT** | Supabase PostgreSQL is the single source of truth |
| **Loyverse** | POS (sales, receipts, items); DB pushes to it via `loyverse-sync` edge fn + push queue |
| **MCP** | Model Context Protocol — how AI agents interact with the system |
| **Mission Control** | Cross-domain business task management (kitchen, procurement, finance, marketing, ops, sales, strategy, tech, legal) |

## Active Projects

| Project | Path | Status |
|---------|------|--------|
| Admin Panel | `apps/admin-panel/` | Active — deployed on Vercel |
| KDS | `apps/kds/` | Active |
| Public site | separate repo **shishka-health** | Live at shishka.health (brand design system lives there) |

## AI Agents

| Agent | Brains | Hands (MCP) |
|-------|--------|-------------|
| Chef | `agents/chef/` | `services/mcp-chef/` |
| Finance | `agents/finance/` | `services/mcp-finance/` |
| COO / Strategy | `agents/coo/`, `agents/strategy/` | `services/mcp-mission-control/` |
| Lawyer | `agents/lawyer/` | (docs + GDrive custodian) |
| Procurement | `agents/procurement/` | (uses Chef MCP catalogs) |
| Tech-lead | `agents/tech-lead/` | (repo + Supabase MCP) |

## Business Domains (Mission Control)

| Domain | Context | Scope |
|--------|---------|-------|
| Kitchen & R&D | `docs/business/domains/kitchen.md` | Recipes, BOM, nutrition, food safety |
| Procurement | `docs/business/domains/procurement.md` | Suppliers, purchasing, inventory |
| Finance | `docs/business/domains/finance.md` | Receipts, P&L, budget, taxes |
| Marketing | `docs/business/domains/marketing.md` | Content, branding, campaigns |
| Operations | `docs/business/domains/ops.md` | Staff, SOPs, equipment, training |
| Sales | `docs/business/domains/sales.md` | Pricing, platforms, reviews |
| Strategy | `docs/business/domains/strategy.md` | Vision, locations, growth |

## Next Steps

- Read `STATUS.md` for current state and active tasks
- Read `docs/tech-stack.md` for infrastructure details
- Read `docs/constitution/operational-rules.md` for immutable rules
