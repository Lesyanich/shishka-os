# Global Deployment State

**Last updated:** 2026-04-05 (Grand Triage)
**Database:** Supabase PostgreSQL 17.6 (ap-south-1, project: qcqgtcsjoacuktcewpvo)
**Latest migration:** 091 (business_tasks — applied 2026-04-03)
**Active branch:** `feature/phase-6-mapping-engine`
**Strategic focus:** PATH TO OPENING — все приоритеты пересмотрены 2026-04-05

## Active Projects

| Project | Status | State File |
|---------|--------|------------|
| **admin-panel** | Active (Phase 17 + Production Flow UI + Equipment Location) | `docs/projects/admin/CURRENT.md` |
| shishka-web | Planned | `apps/web/` |
| shishka-app | Planned | `apps/app/` |

## Global Roadmap

| Phase | Name | Project | Status |
|-------|------|---------|--------|
| 17 | Syrve Foundation — Nomenclature Mapping | admin | **IN PROGRESS** |
| — | Staff Schedule & Kitchen Dashboard | admin | **DONE** (frontend, migration pending apply) |
| — | Backward Scheduling | admin | **DONE** (frontend) |
| — | Production Flow UI | admin | **DONE** (ProductionOrders, RecipeStepCard, Equipment Location) |
| — | PWA Foundation | admin | **DONE** (manifest + meta tags) |
| 18 | Purchase Push — Закупки -> Syrve | admin | planned |
| 19 | Sales Pull — Продажи из Syrve | admin | planned |
| 20 | Waste Push + Analytics Comparison | admin | planned |

## Mission Control (Business Task Management)

- **DB tables**: `business_tasks` + `business_initiatives` (migration 091, applied 2026-04-03)
- **MCP server**: `services/mcp-mission-control/` — standalone MCP with 4 tools (extracted from mcp-chef, 2026-04-04)
- **MCP tools**: `emit_business_task`, `list_tasks`, `get_task`, `update_task`
- **Task queue**: `docs/plans/QUEUE.md` (file-based backup, agents use `list_tasks` MCP)
- **Dispatch rules**: `docs/business/DISPATCH_RULES.md`
- **Domain contexts**: `docs/business/domains/` (7 domains)
- **UI**: `apps/admin-panel` MissionControl page — **NEXT** (spec: `docs/plans/mission-control-ui-spec.md`)

## Knowledge System (Bible)

- **Bible files**: `docs/bible/` — 9 thematic files + INDEX.md router (created 2026-04-05)
- **Protocol**: `docs/constitution/bible-protocol.md` — who reads, who writes, input flows
- **CLAUDE.md**: Updated with LK level (Knowledge Base routing table)
- **Agent integration**: Chef + Finance AGENT.md updated with bible loading instructions
- **field_notes table**: PLANNED (MC task: `11fd307b`, spec: `docs/plans/spec-field-notes.md`)
- **Knowledge Hub UI**: PLANNED — 5 phases (MC tasks: `b2c93d14`→`5997ec22`, spec: `docs/plans/spec-knowledge-hub.md`)
  - Phase 1: bible_pages + field_notes DB tables (high)
  - Phase 2: Read-only Wiki UI (high)
  - Phase 3: Inline editor + version history (medium)
  - Phase 4: Field Notes UI + full-text search (medium)
  - Phase 5: MCP tools + agent integration (medium)
- **Source**: Migrated from Notion SHISHKA CORE HUB (14-page PDF)

## Execution Priority (Grand Triage 2026-04-05)

Критерий: **"Приближает ли к открытию?"**

| Tier | Priority | Task | MC ID | Status |
|------|----------|------|-------|--------|
| 1 | CRITICAL | Chef Agent: BOM data entry | `fa01b2d4` | in_progress |
| 1 | CRITICAL | Receipt Inbox Management UI | `68af7dc1` | backlog → ready |
| 1 | CRITICAL | UX Audit: Kitchen Pages | `26a8ec5b` | backlog → ready |
| 2 | HIGH | Kitchen Production System | `9563ea4e` | backlog |
| 2 | HIGH | HR & Payroll System | `4c029fc0` | backlog |
| 3 | MEDIUM | MC UI Filters | `7b52314e` | backlog |
| 3 | MEDIUM | POS Barcode | `a4c76318` | blocked (hardware) |
| 3 | MEDIUM | Barcode Printer | `04a67a19` | blocked (hardware) |
| 4 | LOW | 16 tasks (Knowledge Hub, MC Agile, etc.) | — | after opening |

Full queue: `docs/plans/QUEUE.md`

## Cross-Project Blockers

None.

## Shared Resources

- DB Schema summary: `docs/domain/db-schema-summary.md`
- Full DB Schema: `vault/Architecture/Database Schema.md`
- Keys & Secrets: `docs/keys-config.md`
- Constitution: `docs/constitution/`
- **Knowledge Base (Bible)**: `docs/bible/INDEX.md` → 9 files
