# Global Deployment State

**Last updated:** 2026-03-31
**Database:** Supabase PostgreSQL 17.6 (ap-south-1, project: qcqgtcsjoacuktcewpvo)
**Latest migration:** 079 (equipment_maintenance — applied)
**Active branch:** `feature/phase-6-mapping-engine`

## Active Projects

| Project | Status | State File |
|---------|--------|------------|
| **admin-panel** | Active (Phase 17 + Production Flow UI + Equipment Location) | `docs/context/projects/admin/CURRENT.md` |
| shishka-web | Planned | `docs/context/projects/web/CURRENT.md` |
| shishka-app | Planned | `docs/context/projects/app/CURRENT.md` |

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

## Cross-Project Blockers

None.

## Shared Resources

- DB Schema summary: `docs/context/shared/db-schema-summary.md`
- Full DB Schema: `02_Obsidian_Vault/Architecture/Database Schema.md`
- Keys & Secrets: `docs/context/state/keys-config.md`
- Constitution: `docs/context/constitution/`
