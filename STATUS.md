# Global Deployment State

**Last updated:** 2026-04-03
**Database:** Supabase PostgreSQL 17.6 (ap-south-1, project: qcqgtcsjoacuktcewpvo)
**Latest migration:** 091 (business_tasks — pending apply)
**Active branch:** `feature/phase-6-mapping-engine`

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

- **DB tables**: `business_tasks` + `business_initiatives` (migration 091, pending apply)
- **Dispatch rules**: `docs/business/DISPATCH_RULES.md`
- **Domain contexts**: `docs/business/domains/` (7 domains)
- **UI**: `apps/admin-panel` MissionControl page (Phase 2, planned)
- **MCP**: Dispatcher agent (Phase 4, planned)

## Cross-Project Blockers

None.

## Shared Resources

- DB Schema summary: `docs/domain/db-schema-summary.md`
- Full DB Schema: `vault/Architecture/Database Schema.md`
- Keys & Secrets: `docs/keys-config.md`
- Constitution: `docs/constitution/`
