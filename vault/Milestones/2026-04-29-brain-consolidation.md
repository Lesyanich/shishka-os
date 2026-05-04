---
title: 2026-04-29 — Brain consolidation
type: milestone
date: 2026-04-29
tags: [milestone, brain, ontology]
related:
  - "[[Decisions/D-001-mempalace-deprecated]]"
  - "[[Tech/]]"
aliases: [brain-consolidation-2026-04-29]
---

# 2026-04-29 — Brain consolidation

> [!info] Milestone
> Single consolidated brain spec replaces 7 prior specs. Vault ontology pivots to entity-first (9 front-door folders + 4 sidebar folders). MemPalace deprecated.

## What shipped

- `docs/plans/spec-brain-system.md` — consolidated spec (replaces 7 archived specs)
- 7 prior specs moved to `docs/plans/_archive/` with `[SUPERSEDED 2026-04-29]` header
- `vault/README.md` rewritten for entity-first ontology
- `vault/_Templates/Entity.md` (renamed from `Domain.md`) — landing-page template for entity folders
- 9 entity folders created with placeholder READMEs: Menu, Brand, Recipes, Equipment, Procurement, Finance, Operations, Database, Tech
- `vault/Decisions/D-001-mempalace-deprecated.md` — first decision in new ontology
- `vault/Domains/` and `vault/Projects/` removed (redundant under entity-first)
- 3 follow-up MC tasks emitted: Confluence Reader page (B-1), Graphify MCP wiring (B-2), content build-out (B-3)

## What this enables

- Lesia browses `/brain` Confluence-style with sidebar tree of entities (B-1 ships the reader)
- Agents query Graphify via MCP for cheap topic retrieval (B-2 ships the wiring)
- Encyclopedic content fills the 9 entity folders (B-3 curates from existing sources)

## See Also

- Audit task: `a180ff33-c1b5-49d2-b2c8-98c2f49b94ac`
- Spec: [[../docs/plans/spec-brain-system.md]] (consolidated)
- Decision: [[Decisions/D-001-mempalace-deprecated]]
