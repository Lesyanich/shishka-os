---
title: ERP Consolidation
type: project
tags: [project, admin-panel, kds, roles]
date: 2026-04-13
status: active
domain: "[[Domains/Admin Panel]]"
mc_task: 25cc50dd
spec: null
branch: feature/admin/erp-consolidation
pr_numbers: []
start: 2026-04-13
end: null
related: []
aliases: [ERP Merge, Admin+KDS Merge]
---

# ERP Consolidation

> [!info] Project
> Merge admin-panel + KDS PWA + role-based access into one URL with grouped sidebar.

## Objective

Replace 23 flat sidebar items, fake `RoleContext` (localStorage), and the separate `apps/kds/` PWA with a single admin-panel that switches view by DB-backed role. Sequential 4-task plan: ERP-1 migration adds `auth_user_id` + `app_role` on `staff` and cleans fake data; ERP-2 swaps `RoleContext` for `AppRoleContext` and a 5-section grouped sidebar; ERP-3 ports KDS components into `/kitchen/*`; ERP-4 deletes dead routes and archives `apps/kds/`.

## Current State

- **Phase:** in flight on `feature/admin/erp-consolidation`
- **Owner:** [[People/Lesia]]
- **Umbrella:** MC `25cc50dd`
- **Branch:** `feature/admin/erp-consolidation`

## Recent Outcomes

- 2026-04-13 — CEO approved 4-task plan; all four MC tasks have full RULE-HANDOFF-PACKET comments
- 2026-04-28 — execution sequential (1→2→3→4); single PR after task 4

## Risks & Open Questions

- Real staff roster ([[People/Lesia]], [[People/Bas]], [[People/Alex]], [[People/Hein]]) — fake names Noi/Som/Lek must be cleaned by ERP-1
- Kitchen tablet is shared — UI must survive role switching mid-shift

## See Also

- Related: [[Projects/Phase 7.1 DB Architecture]]
- Domain: [[Domains/Admin Panel]], [[Domains/KDS]]
