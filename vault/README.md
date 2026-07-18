---
title: Vault — Shishka Knowledge Vault
tags:
  - vault
  - knowledge-graph
  - ontology
  - meta
date: 2026-04-29
status: active
aliases:
  - Knowledge Vault
  - Shishka Vault
---

# Vault — Shishka Knowledge Vault

The vault is Shishka's **business-knowledge layer**. Plain markdown files describing the business as concepts you can read, link, and grow over time. Three consumers read the same files:

- **Lesia (CEO)** in Obsidian (direct edit, Graph View) and in the admin panel at `/brain` (read + inline edit)
- **Other humans** in the admin panel `/brain` Confluence reader
- **AI agents** through file reads (grep + `Read`)

All three see the same content. There is no agent-private fork and no human-private fork.

> [!info] Single Source of Truth
> The vault is the SSoT for **business knowledge that does not live in code or in the database**. Decisions, domain definitions, project status, where assets live, who owns what. Operational state (orders, inventory, receipts) lives in Supabase. Code lives in `apps/`, `services/`, `agents/`. The vault holds everything between.

## Folder Taxonomy

The vault has two zones: **front-door entity folders** (where humans browse) and **sidebar audit-log folders** (history accumulating over time).

### Front-door — entity folders (encyclopedic, 50–500 lines per page)

| Folder | Scope |
|---|---|
| `Menu/` | Customer-facing menu, dish concept, nutrition, pricing, customer experience |
| `Brand/` | Identity, voice, visual system, design tokens, logo, photography |
| `Recipes/` | Cooking knowledge, BOMs, technique, food cost rollup |
| `Equipment/` | Machines, kitchen gear, capex, routing, maintenance |
| `Procurement/` | Suppliers, sourcing, purchase logs, comparison protocol |
| `Finance/` | Receipts, COGS/CAPEX/OPEX, ledger model, financial targets |
| `Operations/` | Locations, shifts, staff workflow, food safety, daily standards, KDS |
| `Database/` | Schema, RLS, migrations index, RPC catalog |
| `Tech/` | Stack, infra, CI/CD, deployment, agent system, security, architecture |

### Sidebar — audit log (short, 5–30 lines per page)

| Folder | Scope | Naming |
|---|---|---|
| `Decisions/` | One note per CEO-ratified decision | `D-NNN-<slug>.md` (global, never renumbered) |
| `Milestones/` | Releases, pivots, launches, incidents | `<YYYY-MM-DD>-<slug>.md` |
| `People/` | Team members | `<FirstName>.md` |
| `Open Questions/` | Unresolved questions awaiting CEO decision | `<question-slug>.md` |

### Existing folders (legacy and meta)

| Folder | Status |
|---|---|
| `Architecture/` | Legacy — 6 notes will migrate into `Database/`, `Finance/`, `Procurement/`, `Menu/`, `Tech/` during content build-out (B-3) |
| `Handover/` | Cross-session handover docs |
| `_Templates/` | Frontmatter templates per type |
| `_Archive/` | Deprecated content (kept for history) |

## Edges = wikilinks only

Notes connect **only** through `[[Note Name]]` wikilinks inside note bodies. No edge JSON, no manual edge maintenance. Obsidian's Graph View renders these locally. (The generated `graph.json` / graphify pipeline was retired 2026-07-18 — see `docs/plans/spec-graphify-retirement.md`.)

## Frontmatter

Every note carries YAML frontmatter:

```yaml
---
title: <human-readable title>
type: domain | decision | milestone | person | question | project | architecture
tags: [tag1, tag2]
date: YYYY-MM-DD
status: <type-specific>
aliases: []          # optional — for Obsidian linking
assets:              # optional — Drive paths and external links
  - label: "Logo files"
    path: "Drive: Brand/Logos/"
    url: "https://drive.google.com/..."   # optional, if a direct URL exists
---
```

The `assets:` block renders as a "Where things live" panel in the admin Pages tab and is aggregated into `/brain/drive` (Drive Map). Use it for receipts folders, photo libraries, signed contracts, brand kits — anything stored on Drive that the page references.

Type-specific fields are documented in `_Templates/<Type>.md`.

## Naming Rules

- **English only** (RULE-LANGUAGE-CONTRACT). Russian goes in conversation, not in repo.
- **Decisions** are numbered globally and never renumbered: `D-014-erp-merge.md` stays `D-014` even if a later decision supersedes it.
- **Entity pages** use Title Case (`Menu/Salads.md`, `Brand/Voice.md`).
- **Domain folder names** are PascalCase singular (`Procurement/`, not `procurement` or `procurements`).
- **Milestones** are date-prefixed for sortability: `2026-04-12-lightrag-decommissioned.md`.

## Two writers, same files

The vault is maintained automatically by agents AND manually by Lesia. Both paths converge in the same folder structure.

**Agent path** — `RULE-VAULT-WRITE-ON-CLOSURE` (in `docs/constitution/agent-rules.md`): when an agent closes an MC task, it appends or updates the relevant vault note(s). Decision → `Decisions/D-NNN-…`. Project advanced → update relevant entity page. New question → `Open Questions/<slug>.md`. Skip only when the task is purely operational.

**CEO path** — two interchangeable surfaces:
- **Admin Pages tab** at `/brain` — `Edit` button → markdown editor in browser → `Save` commits to git via GitHub App. Works from any device with admin login.
- **Obsidian on Mac** — direct file edit → `git pull` / `git push` (Obsidian Git plugin recommended). Live Graph View, drag-and-drop image attachments.

Both paths write to the same `vault/<path>.md`, so Obsidian and the admin Pages tab always show the same content.

## Render Pipeline

```
vault/*.md
   │
   ├─→ Obsidian (live, Lesia)
   │
   ├─→ /api/vault/save (admin Pages tab editor)
   │       │
   │       └─→ GitHub App commit → git
   │
   └─→ build-vault-json.mjs (on build)
          │
          └─→ apps/admin-panel/public/vault.json
                   │
                   ├─→ /brain (Pages tab, Confluence reader) ← default landing
                   └─→ /brain (Drive Map tab)
```

The `/brain` graph (Map) tab was retired 2026-07-18 — `/brain/wiki` (Pages) is now the default landing. See `docs/plans/spec-graphify-retirement.md`.

## What the Vault Is NOT

- **Not an action ledger** — that's MC tasks
- **Not a verbatim transcript** — that's `session-diary` git-log handover
- **Not Claude-private memory** — that's Auto Memory at `~/.claude/projects/.../memory/`
- **Not technical specs** — those live in `docs/plans/spec-*.md` and link back to entity pages
- **Not the database** — operational state belongs in Supabase

## See Also

- `docs/plans/spec-brain-system.md` — consolidated spec for the brain system
- `docs/constitution/agent-rules.md` — `RULE-VAULT-WRITE-ON-CLOSURE`
- `apps/admin-panel/src/pages/brain/` — admin `/brain` source
