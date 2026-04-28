---
title: Admin Panel
type: domain
tags:
  - domain
  - admin-panel
  - frontend
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: The single web app where the owner runs the business — menu, finance, KDS, brain — all in one dark-themed SPA.
related:
  - "[[Domains/Menu]]"
  - "[[Domains/KDS]]"
  - "[[Domains/Finance]]"
aliases:
  - Admin
  - Dashboard
---

# Admin Panel

> [!info] Domain
> The browser-based control center for Shishka — one SPA covering every owner workflow, deployed to Vercel as a static site.

## Definition

The admin panel is a Vite 7 + React 19 + React Router 7 single-page app — **not Next.js**, despite frequent confusion from Vercel-flavoured tooling. Routes live inline in `src/App.tsx`, the sidebar is in `src/layouts/AppShell.tsx`, the theme is dark-only, and Supabase JS is the only backend client.

## Boundaries

Inside: the SPA shell, routing, layout, shared UI components, the deploy story (Vercel as static host). Outside: backend logic in Supabase, the knowledge graph rendered inside it ([[Projects/Knowledge Hub Admin Page]]), and the operational domains the panel surfaces ([[Domains/Menu]], [[Domains/KDS]], [[Domains/Finance]]).

## Active Projects

- [[Projects/Menu Control Page]] — owner/customer toggle page at `/menu`
- [[Projects/ERP Consolidation]] — role-based sidebar grouping
- [[Projects/Knowledge Hub Admin Page]] — `/brain/knowledge` graph view

## Recent Decisions

- [[Decisions/D-024-always-gh-pr-never-local-merge]] — every admin-panel change ships via gh pr
- [[Decisions/D-018-claim-task-first-action]] — claim gate for parallel admin-panel work
- [[Decisions/D-011-vite-anon-key-public]] — VITE_SUPABASE_ANON_KEY is public-by-design

## See Also

- Architecture: [[Architecture/Shishka OS Architecture]]
- Code paths: `apps/admin-panel/package.json`, `apps/admin-panel/src/App.tsx`, `apps/admin-panel/src/layouts/AppShell.tsx`
- Milestones: [[Milestones/2026-04-24-warmer-dark-tokens]]
