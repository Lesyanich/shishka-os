---
title: Vault — Shishka Knowledge Vault
tags:
  - vault
  - knowledge-graph
  - ontology
  - meta
date: 2026-04-28
status: active
aliases:
  - Knowledge Vault
  - Shishka Vault
---

# Vault — Shishka Knowledge Vault

The vault is Shishka's **business-knowledge graph** — a folder of plain Markdown notes describing the business as concepts (decisions, domains, projects, open questions, milestones, people), not as files.

Two consumers read this vault:
- **Obsidian** (Lesia) — direct edit, Graph View
- **Graphify → admin panel** at `/brain/knowledge` — visualises the graph for the whole team

> [!info] Single Source of Truth
> The vault is the SSoT for **business knowledge that does not live in code or in the database**. Decisions, domain definitions, project status, who-owns-what. Operational state (orders, inventory) lives in Supabase. Code lives in `apps/`, `services/`, `agents/`. The vault holds everything between.

## Folder Taxonomy

| Folder | Purpose | Naming convention | Example |
|---|---|---|---|
| `Architecture/` | System diagrams, schemas, integration maps | Title Case | `Database Schema.md` |
| `Decisions/` | One note per CEO-ratified decision | `D-NNN-<slug>.md` | `D-014-erp-merge.md` |
| `Domains/` | Business domains as concepts | PascalCase | `Menu.md`, `Procurement.md` |
| `Projects/` | Current and recent initiatives | Title Case | `Menu Control Page.md` |
| `Open Questions/` | Unresolved questions awaiting decisions | `<question-slug>.md` | `mempalace-fate.md` |
| `Milestones/` | Releases, pivots, incidents, launches | `<YYYY-MM-DD>-<slug>.md` | `2026-04-12-lightrag-decommissioned.md` |
| `People/` | Team members | First name | `Lesia.md`, `Bas.md` |
| `Handover/` | Cross-session handover docs | Title Case | `HANDOVER.md` |
| `_Templates/` | Frontmatter templates per type | `<Type>.md` | `Decision.md` |
| `_Archive/` | Deprecated content (kept for history) | mirror folder | `_Archive/Blueprints/` |

## Edges = Wikilinks Only

The vault graph is built **only** from wikilinks `[[Note Name]]` inside note bodies. Do not maintain edge lists, JSON, or front-matter `links:` arrays. Graphify reads wikilinks during the pipeline run.

## Frontmatter

Every note has YAML frontmatter. Common fields (always present):

```yaml
---
title: <human-readable title>
type: decision | domain | project | question | milestone | person | architecture
tags: [tag1, tag2]
date: YYYY-MM-DD          # creation date
status: <type-specific>
aliases: []               # optional, for Obsidian linking
---
```

Type-specific fields are documented in `_Templates/<Type>.md`.

## Naming Rules

- **English only** (RULE-LANGUAGE-CONTRACT). Russian goes in conversation, not in repo.
- **Decisions** are numbered globally and never renumbered: `D-014-erp-merge.md` stays `D-014` even if a later decision supersedes it.
- **Projects** use title case (`Menu Control Page.md`), match the title used in MC tasks.
- **Domains** use PascalCase singular (`Procurement.md`, not `procurement` or `procurements`).
- **Milestones** are date-prefixed for sortability: `2026-04-12-lightrag-decommissioned.md`.

## Dual Write-Path

The vault is maintained automatically by agents AND manually by Lesia. Both paths converge in the same folder structure.

**Agent path** — `RULE-VAULT-WRITE-ON-CLOSURE` (see `docs/constitution/agent-rules.md`): when an agent calls `update_task(status='done')`, it must also append or update one note in the appropriate folder. Decision made → `Decisions/D-NNN-<slug>.md`. Project advanced → update `Projects/<name>.md` status. New open question → `Open Questions/<slug>.md`. Cross-cutting domain knowledge → update `Domains/<name>.md`.

Skip the vault write only when the task is purely operational (cleanup, retry, mechanical fix, no new knowledge produced).

**Manual path** — Lesia edits any vault file in Obsidian. Graph View shows changes live. The next Graphify run propagates to the admin panel at `/brain/knowledge`.

## Render Pipeline

```
vault/*.md
   │
   ├─→ Obsidian (live, Lesia)
   │
   └─→ graphify run
          │
          ├─→ apps/admin-panel/public/graph.json
          └─→ apps/admin-panel/public/graph-analytics.json
                   │
                   └─→ /brain/knowledge (vis-network)
```

`BrainKnowledgePage.tsx` colours nodes by category. Categories matching `^vault/<Folder>/` regex live in the `CATEGORIES` array — see `apps/admin-panel/src/pages/brain/BrainKnowledgePage.tsx`.

## What the Vault Is NOT

- **Not an action ledger** — that's MC tasks
- **Not a verbatim transcript** — that's MemPalace (when wired) or COO Running Log
- **Not Claude-private memory** — that's Auto Memory at `~/.claude/projects/.../memory/`
- **Not technical specs** — those live in `docs/plans/spec-*.md` and link back to `Projects/`
- **Not the database** — operational state belongs in Supabase

## See Also

- `docs/plans/spec-knowledge-vault-bootstrap.md` — the spec for this vault structure
- `docs/plans/spec-shishka-brain.md` — the parent three-layer memory architecture
- `docs/plans/spec-graphify-phase3.md` — Graphify pipeline that renders this vault
- `docs/constitution/agent-rules.md` — `RULE-VAULT-WRITE-ON-CLOSURE`
