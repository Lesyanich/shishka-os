---
title: Knowledge Hub Admin Page
type: project
tags: [project, admin-panel, knowledge, bible]
date: 2026-04-05
status: active
domain: "[[Domains/Admin Panel]]"
mc_task: null
spec: docs/plans/spec-knowledge-hub.md
branch: feature/admin/knowledge-hub
pr_numbers: []
start: 2026-04-05
end: null
related: []
aliases: [Bible UI, Knowledge Hub]
---

# Knowledge Hub Admin Page

> [!info] Project
> One place in the admin panel where the bible, field notes, and search live — replacing Notion + Obsidian for the team.

## Objective

A unified `/knowledge` section in admin-panel rendering `bible_pages` from Supabase as a Notion-style wiki: left sidebar with all bible pages, right pane with rendered markdown + history + linked field notes. Editing happens inline with mandatory change summaries; agents read the same content via `get_bible_page` MCP. Files in `docs/bible/*.md` become export copies, not the SSoT.

## Current State

- **Phase:** Phase 1 (DB + seed) — schema and seed pending migration
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-knowledge-hub.md`
- **Branch:** `feature/admin/knowledge-hub`

## Recent Outcomes

- 2026-04-05 — spec drafted by COO; schema design, RLS, and seed plan locked
- 2026-04-28 — still gated by `field_notes` table and `bible_pages` migration not yet applied

## Risks & Open Questions

- Markdown editor choice (`@uiw/react-md-editor` vs lightweight textarea + preview) not yet decided
- `get_bible_page` MCP shape needs to match agent loaders in CLAUDE.md before cutover

## See Also

- Spec: `docs/plans/spec-knowledge-hub.md`
- Related: [[Projects/Knowledge Vault Bootstrap]], [[Projects/Shishka Brain v2]]
- Domain: [[Domains/Admin Panel]]
