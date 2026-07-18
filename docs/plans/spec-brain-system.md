# Spec: Shishka Brain System — Consolidated

> **⚠️ PARTIALLY SUPERSEDED 2026-07-18:** the **Graphify / knowledge-graph layer (L2, §5.2, the graph pipeline & MCP)** was retired — net-negative vs grep in an A/B; see `docs/plans/spec-graphify-retirement.md`. Agents navigate code with **grep + `Read`**; humans read structure via the **vault wiki (`/brain/wiki`)**. The vault-wiki and Drive-Map layers of this spec remain accurate; treat every Graphify mention below as historical.
>
> **Status:** active for the vault/wiki layers; Graphify layer retired (replaces 7 prior specs, see §11)
> **Author:** consolidated 2026-04-29 from audit task `a180ff33`
> **MC Initiative:** `8ee586b9` Brain — knowledge graph + entity navigation
> **Branch:** `feature/brain/system-consolidation`

## 1. Purpose

Single source of truth for **how Shishka knows what it knows**. Replaces 7 fragmented specs that accumulated across epochs (LightRAG era, MemPalace pivot, Graphify adoption, vault bootstrap). Defines:

- which memory layers are alive, which are archived
- where each kind of fact lives (code, DB, vault, Auto Memory, MC tasks)
- how humans navigate the brain (admin `/brain` Confluence-style)
- how agents query the brain efficiently (Graphify MCP)
- the dual write-path (agents auto-write on task closure, CEO edits in Obsidian)

## 2. Layer Map — what stores what

| Layer | Tool | Stores | Owner | Status |
|---|---|---|---|---|
| **L0 Auto Memory** | `~/.claude/projects/.../memory/` | Claude-private patterns: user profile, feedback, project context | Claude (per-machine) | ✅ active |
| **L1 Vault** | `vault/*.md` (this repo) | Encyclopedic business knowledge: domains, decisions, milestones, projects, people, open questions | CEO + agents | ✅ active (this spec defines ontology) |
| **L2 Graphify** | `graph.json` + `graph-analytics.json` | Structural graph of vault + code + docs (1.7K nodes, 1.7K edges) | Graphify CLI (nightly) | ✅ active, MCP wiring planned |
| **L3 MC tasks** | Supabase `business_tasks` | Action ledger — what needs doing, what was done | MC | ✅ active |
| **L4 Code & DB** | `apps/`, `services/`, `agents/`, Supabase migrations | Operational state and behavior | engineering | ✅ active |

**Explicitly archived:**

| Tool | Archived | Why |
|---|---|---|
| LightRAG | 2026-04-12 | Replaced by Graphify (multimodal, local, free) |
| MemPalace | 2026-04-29 | Never wired to MCP; `session-diary` skill (git-log handover) covers the practical use case |
| `04_Knowledge/` directory | 2026-04 (partial) | Migrated to `knowledge/` for unique content; remainder duplicated `vault/` |
| Knowledge Hub Supabase tables (`bible_pages`, `bible_page_history`) | 2026-04-29 (never built) | vault/ markdown is sufficient SSoT; admin reads files, not DB |

## 3. Vault Ontology — entity-first

The vault is organized **by what the business is**, not by what role read it. Two zones:

### 3.1 Front-door (entry points — 9 entity folders)

Pages here are **encyclopedic** (50–500 lines): real content, diagrams, links, screenshots, drive paths. These are what humans read.

| Folder | Scope | Sources to extract from |
|---|---|---|
| `Menu/` | Customer-facing menu, dish concept, nutrition, pricing | `nomenclature` table (SALE-* + dish), `recipes_flow`, `apps/admin-panel/.../menu` |
| `Brand/` | Identity, voice, visual system, tokens, logo, photography | `docs/branding/`, `agents/designer/brand-tokens.md`, Drive `Brand/` folder |
| `Recipes/` | Cooking knowledge, BOMs, technique, food cost rollup | `recipes_flow` table, `bom_structures`, `RecipeBuilder.tsx`, `extract_recipes.mjs` |
| `Equipment/` | Machines, kitchen gear, capex, routing, maintenance | `equipment` table, capex flow, `vault/_Archive/03_Infrastructure/` |
| `Procurement/` | Suppliers, sourcing, purchase logs, comparison protocol | `supplier_catalog`, `purchase_logs`, `vault/Architecture/Procurement & Receiving Architecture.md` |
| `Finance/` | Receipts, COGS/CAPEX/OPEX, ledger model, financial targets | `expense_ledger`, `capex_assets`, `vault/Architecture/Financial Ledger.md`, `docs/bible/targets.md` |
| `Operations/` | Locations, shifts, staff workflow, food safety, KDS, daily standards | TBD with CEO; current sources include `docs/bible/operations.md`, KDS spec |
| `Database/` | Schema, RLS, migrations index, RPC catalog | `vault/Architecture/Database Schema.md`, `services/supabase/migrations/`, `services/mcp-*/` |
| `Tech/` | Stack, infra, CI/CD, deployment, agent-system architecture, security | `docs/tech-stack.md`, `vault/Architecture/Shishka OS Architecture.md`, `.github/`, hooks |

### 3.2 Sidebar (audit log — 4 history folders)

Pages here are **short** (5–30 lines): one event per file, dated, linked back to the entity it touched. These accumulate over time and are read mostly by agents and rarely by humans.

| Folder | Scope | Naming |
|---|---|---|
| `Decisions/` | One note per CEO-ratified decision | `D-NNN-<slug>.md` (global numbering, never renumbered) |
| `Milestones/` | Releases, pivots, launches, incidents | `<YYYY-MM-DD>-<slug>.md` |
| `People/` | Team members | `<FirstName>.md` |
| `Open Questions/` | Unresolved questions awaiting CEO decision | `<question-slug>.md` |

### 3.3 Architecture/ folder — disposition

Existing notes in `vault/Architecture/` (6 files) move into the matching entity folder during content build-out (B-3). Until then they remain in place and the new entity README links back to them. No file deletions in this audit task.

| Current file | Future home |
|---|---|
| `Architecture/Database Schema.md` | `Database/Schema.md` |
| `Architecture/Financial Ledger.md` | `Finance/Ledger.md` |
| `Architecture/Receipt Routing Architecture.md` | `Finance/Receipt Routing.md` |
| `Architecture/Procurement & Receiving Architecture.md` | `Procurement/Receiving.md` |
| `Architecture/Product Categorization Architecture.md` | `Menu/Product Categorization.md` |
| `Architecture/Shishka OS Architecture.md` | `Tech/Architecture.md` |

### 3.4 Edges = wikilinks only

The vault graph is built from `[[Note Name]]` references inside note bodies. No edge JSON, no manual edge maintenance. Graphify reads wikilinks during the pipeline run. This is unchanged from PR #151.

### 3.5 Frontmatter

Every note carries YAML frontmatter:

```yaml
---
title: <human-readable title>
type: domain | decision | milestone | person | question | project | architecture
tags: [tag1, tag2]
date: YYYY-MM-DD
status: <type-specific>
aliases: []          # optional, for Obsidian linking
assets:              # optional — Drive paths and external links
  - label: "Logo files"
    path: "Drive: Brand/Logos/"
  - label: "Receipt scans 2026-04"
    path: "Drive: Finance/Receipts/2026-04/"
---
```

Type-specific fields are documented in `vault/_Templates/<Type>.md`.

## 4. Admin `/brain` — Confluence for humans, map for agents

The admin page at `shishka-os.vercel.app/brain` is the **primary human interface** to the brain. Three tabs:

### 4.1 Tab 1 — Map (graph view)

Default landing tab. The vis-network graph rendered from `graph.json` — same engine as today, restructured around vault as the centerpiece.

**Behavior:**
- Filter chips (top): "All", "Vault only", "Code only", "Vault + agents". Default = "Vault + agents" (vault concepts at center, agent files orbiting).
- Click a node → opens that page in the **Pages tab** (right-side panel, or full navigation).
- Real-time growth: every Graphify run regenerates `graph.json`. Lesia sees the brain grow week by week.
- Graph categories: 9 entity colors + 4 sidebar colors + existing code/agent colors (kept).

**Stays as-is:**
- vis-network rendering, force layout, search, fullscreen, notes drawer.
- god-nodes panel, communities panel.

**Changes:**
- Add 9 entity-folder categories with distinct colors and icons (see B-1 follow-up).
- "Show vault only" filter chip — hides code nodes, leaves ~50–200 vault concept nodes for clean human reading.
- Click-to-open Pages tab (currently nodes show metadata only).

### 4.2 Tab 2 — Pages (Confluence reader)

New page. Sidebar tree on the left (`vault/` folder structure), markdown reader on the right.

**Sidebar tree:**
- 9 entity folders + 4 sidebar folders + Architecture (legacy until B-3 finishes)
- Folder expand/collapse, page count badges
- Current page highlighted

**Reader:**
- Markdown rendering: headers, tables, code blocks, lists, callouts (`> [!info]`, `> [!warning]`)
- Wikilinks `[[Note Name]]` resolve to clickable in-app links
- Auto-generated TOC from `##` headers (sticky right rail)
- Frontmatter `assets:` rendered as a "Where things live" panel with Drive paths and external links
- Breadcrumb: `Brain / Menu / Salads.md`
- "Last updated" timestamp from git history

**v1 includes inline editing.** Two edit paths, both write to the same `vault/*.md` in git:

| Path | Trigger | Mechanism |
|---|---|---|
| **In-admin editor** | Click `Edit` on a Pages tab note | Markdown editor + live preview → `Save` → `POST /api/vault/save` (Vercel API route) → GitHub App commits to main → Vercel rebuilds → next Graphify run picks up the edit |
| **Obsidian** | Open the vault on Lesia's Mac | Direct file edit → manual `git pull` / `git push` (or Obsidian Git plugin) — same file, no duplication |

Conflict handling: editor refetches the file's current `sha` from GitHub before save. If it has changed since the editor opened, show "Someone else edited this — refresh and reapply your change." (Realistically: solo writer, low risk.)

**Out of scope for v1 inline editor:**
- Image upload (use Obsidian drag-and-drop into `vault/` for now; v2 adds `POST /api/vault/upload-asset` writing to Supabase Storage)
- Rename / move (use Obsidian — keeps wikilinks intact via Obsidian's rename refactor)
- Delete (use Obsidian + git)

**Auth:** the admin panel already authenticates Lesia via Supabase. The `/api/vault/save` route checks the session role and rejects anyone except admin. The GitHub App credentials live in Vercel env vars, never reach the browser.

### 4.3 Tab 3 — Drive Map

New page. Categorized index of where things live on Google Drive: receipts, supplier invoices, photo library, logo files, brand kit, contracts, payroll, recipes-as-photos, etc.

**Source:** `vault/Operations/Drive Map.md` — single markdown file with sections per category and clickable Drive folder links. Plus aggregated `assets:` frontmatter from all vault notes.

**Why a tab and not just a vault page:** convenience. Lesia opens `/brain/drive` and instantly knows where any asset is, without navigating the tree. High-frequency lookup.

### 4.4 Removed/deprecated tabs

- `/brain/quality` (Brain Quality dashboard) — keep as-is (already exists, drives `services/brain/` nightly judge)
- `/brain/cost` (Brain Cost dashboard) — keep as-is
- `/brain/memory` (MemPalace browser) — **mark deprecated**, remove route after MemPalace kill (see §6)

## 5. Agent access — efficient, economical

Agents must navigate the brain at least as well as today and ideally cheaper. Three access paths:

### 5.1 Direct file read (existing)

Unchanged. Agents call `Read` on a vault note when they need the full content. Cost ≈ note size.

### 5.2 Graphify MCP (planned — B-2)

A new MCP server wraps the existing Graphify CLI / `graph.json`. Tools:

| Tool | Input | Returns |
|---|---|---|
| `graphify_query_topic` | topic keywords | top-N relevant nodes + 1-paragraph summary per node |
| `graphify_neighborhood` | node ID, depth | subgraph around a node (k-hop), edge labels |
| `graphify_god_nodes` | category filter | most-central nodes, optionally per category |
| `graphify_communities` | category filter | community clusters with member nodes |

**Why this saves cost:** instead of an agent reading 5–10 raw files (5K–20K tokens) to answer "where is receipt parsing?", a single MCP call returns 200–500 tokens of pre-clustered structure. 10–20× cheaper for architectural queries.

**Wiring:** add to `.claude/.mcp.json`. Implementation: thin wrapper around `services/graphify` + Python HTTP shim or direct stdio MCP.

### 5.3 Auto Memory (existing)

Unchanged. Per-machine Claude-private context (user profile, feedback, project state). Loaded automatically by Claude Code at session start. Not in the vault, not in the graph — different layer.

### 5.4 What agents stop using

- MemPalace HTTP wrapper (`services/mempalace/serve.py`) — never wired, deprecated
- Knowledge Hub Supabase tables — never built, scrapped
- LightRAG queries — already removed

## 6. MemPalace — deprecation

MemPalace was specced as L1 conversation memory in 2026-04 (parent: `spec-shishka-brain.md`). Code exists in `services/mempalace/`, MCP server never registered in `.claude/.mcp.json`, no agent ever queried it in production. The practical pain it was meant to solve (cross-session context loss) is covered by:

- `~/.claude/projects/.../memory/` (Auto Memory — Claude-private)
- `.claude/skills/session-diary/` skill (git-log based handover written at session end)
- MC task `notes` and `related_ids.phase` (machine-readable handover)

**Decision:** archive `services/mempalace/` to `_archive/services/mempalace/` and remove the unused admin route `/brain/memory` in a follow-up cleanup task. Keep the `age-recipient.txt` and backup scripts available in archive in case L1 conversation memory becomes necessary later — but no further investment until that pain returns.

Decision recorded as `vault/Decisions/D-NNN-mempalace-deprecated.md` (next free D-NNN).

## 7. Brain Quality Loop — current state

`services/brain/` (judge.py, gap_monitor.py, regression.py, run-nightly.sh) implements the heuristic + LLM-judge scoring flow originally designed in `spec-brain-feedback-loop.md`. It is **partially live** — code exists, plist registered, but admin UI surface is incomplete.

This audit does not modify the loop. The follow-up dashboard work belongs to a separate task (not in scope here). The deprecated spec is archived; behavior in `services/brain/` is the source of truth going forward.

## 8. Knowledge Consolidation — current state

`spec-knowledge-consolidation.md` proposed moving `04_Knowledge/` to `knowledge/`. Partially executed:

- `knowledge/ai-learning/` — moved ✅
- `knowledge/phases/` — moved ✅
- `knowledge/cooking/` (1.9 GB cookbooks) — **not moved**
- `knowledge/industry/` — **not moved**

**Disposition:** the unmoved content is non-critical (research/reference, not operational SSoT). Treat as "stable enough" — add a small follow-up task only if those folders need to be addressable from the admin UI. Spec archived, residual work deferred.

## 9. Dual write-path — agents and CEO

Unchanged from `spec-knowledge-vault-bootstrap.md` Phase 4. Promoted here as the canonical rule.

**Agent path** — `RULE-VAULT-WRITE-ON-CLOSURE` (in `docs/constitution/agent-rules.md`): when an agent closes an MC task, it must append/update the relevant vault note(s). Decision → `Decisions/D-NNN-…`. Project advanced → update `Projects/<name>.md`. New question → `Open Questions/<slug>.md`. Domain knowledge surfaced → update relevant `<Domain>/<page>.md`. Skip only for purely operational tasks (cleanup, retry, no new knowledge).

**CEO path** — two interchangeable surfaces, same file:
- **Admin Pages tab** — `Edit` → markdown editor in browser → `Save` commits to git via GitHub App (works from any device with admin login)
- **Obsidian on Mac** — direct file edit → `git pull` / `git push` (Obsidian Git plugin recommended)

Both write to `vault/<path>.md`. Graphify sees the edit on the next run regardless of which path made it.

## 10. Roadmap — what comes after this audit

This task delivers the consolidated spec, archived old specs, ontology refresh, MemPalace deprecation decision, and follow-up tasks. Implementation happens in three follow-ups:

| ID | Title | Estimate | Blocks |
|---|---|---|---|
| **B-1** | Confluence Reader: Pages tab + Map click-to-open + Drive Map tab | 3–4d | nothing |
| **B-2** | Graphify MCP wiring: `.claude/.mcp.json` + 4 query tools | 1–2d | agent-cost wins |
| **B-3** | Vault content build-out: 9 entity README pages + extract from existing sources | 3–5d (most of it is curation, not code) | B-1 readability |

Tasks `B-1` and `B-2` are independent and can run in parallel. `B-3` benefits from `B-1` shipping first (so curation is reviewed in the new reader). MC tasks emitted at audit close.

## 11. Replaces (archived to `docs/plans/_archive/`)

| Old spec | Verdict | Why |
|---|---|---|
| `spec-shishka-brain.md` | 🔁 SUPERSEDE | 3-layer L1/L2/L3 framing assumed LightRAG. Replaced by this spec's §2 layer map. |
| `spec-mempalace-phase2.md` | ❌ DEAD | Pre-req (LightRAG) decommissioned; tool never wired; replaced by `session-diary`. |
| `spec-graphify-phase3.md` | 🔁 SUPERSEDE | Original spike plan; Graphify adopted with broader scope than spec described. |
| `spec-knowledge-consolidation.md` | 🟡 PARTIAL | Partially executed; residual deferred (§8). |
| `spec-knowledge-hub.md` | ❌ DEAD as written | Supabase `bible_pages` tables redundant — vault/ markdown sufficient. Read-only Confluence reader covers the goal cheaper. |
| `spec-brain-feedback-loop.md` | 🔁 SUPERSEDE | Partially implemented in `services/brain/`; loop kept, spec archived. |
| `spec-knowledge-vault-bootstrap.md` | 🔁 SUPERSEDE | Phase 1 in main; Phase 2 ontology pivoted to entity-first per CEO 2026-04-28. |

## 12. Acceptance

- Lesia reads this spec and confirms it matches her mental model
- All 7 old specs are archived with `[SUPERSEDED 2026-04-29]` header
- `vault/README.md` reflects 9-entity ontology
- `vault/_Templates/` covers all current note types
- 3 follow-up MC tasks created (B-1, B-2, B-3)
- `1ad969ae` is unblocked (replaced by B-3) or marked done
- MemPalace deprecation decision recorded as `D-NNN-mempalace-deprecated.md`

## 13. Out of scope

- No new admin-panel UI in this PR (B-1 owns it)
- No MCP wiring in this PR (B-2 owns it)
- No content writing for the 9 entities in this PR (B-3 owns it)
- No Supabase migrations
- No agent-rules.md edits (RULE-VAULT-WRITE-ON-CLOSURE already lives there from PR #151)
- No deletion of MemPalace code in this PR (separate small task — keep audit task atomic)

## 14. Provenance

- Audit task: `a180ff33-c1b5-49d2-b2c8-98c2f49b94ac`
- CEO sign-off recorded in this conversation 2026-04-29 on three decisions: entity ontology, MemPalace kill, three-tab admin design
- Phase 1 of vault ontology already in main: PR #151 commit `11a9505`
- Phase 2 (65 stub notes) abandoned: PR #153 closed unmerged 2026-04-28
