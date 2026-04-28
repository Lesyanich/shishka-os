---
title: Menu Control Page
type: project
tags: [project, menu, admin-panel]
date: 2026-04-21
status: active
domain: "[[Domains/Menu]]"
mc_task: null
spec: null
branch: feature/admin/menu-control
pr_numbers: []
start: 2026-04-21
end: null
related:
  - "[[Milestones/2026-04-22-menu-url-routing-v2]]"
  - "[[Milestones/2026-04-21-menu-page-brand-tokens]]"
aliases: [/menu, Menu Page]
---

# Menu Control Page

> [!info] Project
> Unified `/menu` page in admin-panel — owner cost dashboard plus customer-facing preview, on one screen with view toggles.

## Objective

One page where the owner sees cost, margin, and food-cost % for every dish, edits inline, and previews the same menu the way a customer will see it on the future website. Built on existing nomenclature + product_categories + bom_structures + tags — no new tables. Owner view has `OwnerTable` and `OwnerGallery` layouts; customer view renders `CustomerPreview` cards with nutrition + tag badges. URL-driven state: `?view=`, `?layout=`, `?type=`, `?cat=`, and `/menu/dish/:productCode` opens the `DetailDrawer`.

## Current State

- **Phase:** active — DetailDrawer wired, keyboard nav and customer preview shipped
- **Owner:** [[People/Lesia]]
- **Page:** `apps/admin-panel/src/pages/menu/MenuPage.tsx`
- **Hook:** `useMenuData` + `useInlineUpdate` (React 19 `useOptimistic`)

## Recent Outcomes

- 2026-04-21 — brand-tokens redress (MC `cf1acf35` + `ba109556`) — see [[Milestones/2026-04-21-menu-page-brand-tokens]]
- 2026-04-22 — URL routing v2 (MC `c425fd5e`) — `?view`/`?layout`/`?type`/`?cat` + `/menu/dish/:productCode` (see [[Milestones/2026-04-22-menu-url-routing-v2]])
- 2026-04-28 — customer preview (`7bb02837`), keyboard nav (`72f27618`), DetailDrawer wiring (`01906a40` + `a81c366c`) all completed

## Risks & Open Questions

- No new tables allowed; cost rollups depend on `bom_structures` integrity
- i18n strings externalizable but no framework in v1 — Thai/English copy still hard-coded

## See Also

- Related: [[Projects/Phase 7.1 DB Architecture]], [[Projects/ERP Consolidation]]
- Domain: [[Domains/Menu]], [[Domains/Admin Panel]]
