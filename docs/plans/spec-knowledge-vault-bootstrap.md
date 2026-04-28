# Spec: Knowledge Vault Bootstrap — Brain page from doc-graph to business-knowledge graph

> MC Task: `1ad969ae-9d1f-4959-b8ab-4b02524da7a7`
> Priority: high
> Status: Phase 1 in progress
> Branch: `feature/brain/knowledge-vault-bootstrap`
> Related:
> - `docs/plans/spec-shishka-brain.md` (parent — three-layer memory)
> - `docs/plans/spec-graphify-phase3.md` (Graphify pipeline)
> - `docs/plans/spec-knowledge-hub.md` (admin UI)
> - `apps/admin-panel/src/pages/brain/BrainKnowledgePage.tsx` (graph view)
> - `vault/` (target)

## 1. Problem Statement

The current Brain Knowledge Graph at `/brain/knowledge` reflects the **structure of code and docs** — file paths grouped by folder regex (Rules & Protocol, Kitchen & Bible, Agents, Backend Services, …). It tells you which files exist where. It does **not** tell you what the business knows.

Lesia wants the same page to render the **business itself**: decisions made, domains owned, projects in flight, open questions, milestones hit, people on the team. Concepts, not files.

The vault, the Graphify pipeline, the vis-network rendering, and the category system already work. What is missing is **content** (business-knowledge notes) and the **ontology** that organises it.

## 2. Context — What Already Works (Do Not Rebuild)

- `vault/` exists in repo: `Architecture/` (6 notes), `Handover/HANDOVER.md`, `_Archive/`, `.obsidian/`
- `apps/admin-panel/src/pages/brain/BrainKnowledgePage.tsx` (889 lines) renders a vis-network graph from `apps/admin-panel/public/graph.json` (~1.3 MB) and `graph-analytics.json` (god_nodes + communities)
- `BrainKnowledgePage` has 10 categories with colors/icons matching regex on file paths (Rules & Protocol, Kitchen & Bible, Finance, Business Strategy, Plans & Architecture, Agents, Admin Panel, Backend Services, AI & Knowledge, Operations) — none currently match `^vault/`
- Graphify pipeline runs over the repo, emits `graph.json` and `graph-analytics.json`. PRs #141 and #143 already filter noise from receipts and tests/configs
- MemPalace bridge already wired for semantic search inside the page (`searchDrawers`)
- Auto Memory has 37+ records (`feedback_*`, `project_*`, `user_*`, `reference_*`) that are the primary import source

## 3. Gap

No category in the admin panel matches `vault/` — vault notes are effectively invisible in the graph today. There are also no notes that describe the business as concepts (decisions, domains, projects, open questions, milestones, people). All knowledge currently lives in:

- Auto Memory (Claude-private, not shared, not graph-rendered)
- MC task comments (action ledger, not knowledge)
- `docs/plans/spec-*.md` (technical specs only)

This task closes that gap.

## 4. Phase 1 — Vault Ontology (0.5d)

Create the following top-level folders in `vault/`:

| Folder | Purpose | Naming |
|---|---|---|
| `Decisions/` | One note per CEO-ratified decision | `D-NNN-<slug>.md` |
| `Domains/` | Business domains as concepts | `<DomainName>.md` (PascalCase) |
| `Projects/` | Current and recent initiatives | `<ProjectName>.md` (Title Case) |
| `Open Questions/` | Unresolved questions awaiting decisions | `<question-slug>.md` |
| `Milestones/` | Releases, pivots, incidents | `<YYYY-MM-DD>-<slug>.md` |
| `People/` | Team members | `<FirstName>.md` |

Add `vault/_Templates/` with one template per type. Templates have YAML frontmatter (matching existing `vault/Architecture/*.md` style: `title`, `tags`, `date`, `status`, `aliases`) plus type-specific fields (e.g. `type: decision`, `id: D-NNN`).

**Edges:** Wikilinks `[[...]]` are the only edge mechanism. No manual graph editing, no separate edge files. Graphify reads wikilinks during the next pipeline run.

Write `vault/README.md` explaining the ontology, naming conventions, and the dual write-path. English only (RULE-LANGUAGE-CONTRACT).

## 5. Phase 2 — Massive Import (1d)

Source-by-source import to populate ~50 starter nodes. **No new fact creation** — only restructuring what already exists.

| Source | Target folder | Approx count |
|---|---|---|
| Auto Memory `feedback_*.md` (23 files) | `Decisions/` (CEO ruling) or `Rules/` mirror | ~20 |
| Auto Memory `project_*.md` (10 files) | `Projects/` (active) or `Milestones/` (closed) or `Domains/` (cross-cutting) | ~10 |
| Auto Memory `user_*.md` + `reference_*.md` (4 files) | `People/` + `Domains/` (where reference describes a sub-domain) | ~4 |
| `docs/plans/spec-*.md` active phases | `Projects/` with link back to spec | ~5 |
| MC tasks `status=done` last 30 days, business-meaningful | `Decisions/` or `Milestones/` | ~10 |
| Existing `vault/Architecture/*` | leave as-is, add wikilinks back to new domain notes | 0 new |

Each imported note: 5–15 lines, frontmatter + 1 paragraph body + wikilinks. NOT a verbatim memory dump — distillate. Import script in `scripts/vault-import.ts` (one-time use, archive after).

**Sign-off gate:** before writing the 50 notes, post an **import map** (`memory file → target folder → note title → 1-line gist`) as an MC task comment. CEO approves or edits, then notes get written.

## 6. Phase 3 — Admin-Panel Category Extension (0.5d)

Patch `BrainKnowledgePage.tsx` `CATEGORIES` array. Add 6 new entries with patterns matching new vault folders:

```ts
{ name: 'Decisions', nameRu: 'Решения', icon: Gavel, pattern: /^vault\/Decisions/, accent: 'text-rose-300', ... }
{ name: 'Domains', nameRu: 'Домены', icon: Layers, pattern: /^vault\/Domains/, accent: 'text-cyan-400', ... }
{ name: 'Projects', nameRu: 'Проекты', icon: Briefcase, pattern: /^vault\/Projects/, accent: 'text-orange-400', ... }
{ name: 'Open Questions', nameRu: 'Открытые вопросы', icon: HelpCircle, pattern: /^vault\/Open Questions/, accent: 'text-amber-300', ... }
{ name: 'Milestones', nameRu: 'Вехи', icon: Flag, pattern: /^vault\/Milestones/, accent: 'text-lime-400', ... }
{ name: 'People', nameRu: 'Команда', icon: Users, pattern: /^vault\/People/, accent: 'text-pink-400', ... }
```

Run Graphify after import → regenerate `graph.json` → verify in admin panel `/brain/knowledge` that new categories appear with correct colors and that `god_nodes` reports no surprises.

## 7. Phase 4 — Auto-Update Mechanism (0.5d)

Establish dual write-path. Document in `docs/constitution/agent-rules.md` as new rule `RULE-VAULT-WRITE-ON-CLOSURE`:

> When an agent calls `update_task(status='done')`, the agent MUST also append/update one note in `vault/`:
> - Decision was made → `Decisions/D-NNN-<slug>.md`
> - Project advanced → update `Projects/<name>.md` status field
> - New open question discovered → `Open Questions/<slug>.md`
> - Domain knowledge surfaced → update relevant `Domains/<name>.md`
>
> Skip vault write only if task is purely operational (cleanup, retry, no new knowledge produced).

Manual path stays as-is — Lesia edits any vault file in Obsidian, Graph View shows live, next Graphify run propagates to admin panel.

Optional: a tiny `scripts/vault-add-decision.sh <slug>` helper that scaffolds a note from `_Templates/Decision.md`.

## 8. Phase 5 — Verification (0.5d)

- `vault/` has 6 new folders + ~50 notes
- `graph.json` regenerated, contains new category nodes
- Admin panel `/brain/knowledge` renders with 6 new colored clusters visible
- `god_nodes` from `graph-analytics.json` reviewed — no single node should dominate
- Lesia opens vault in Obsidian, Graph View shows recognisable business map
- Add at least 1 manual note + 1 agent-written note to confirm both paths work

## 9. Out of Scope

- No new backend service
- No changes to Graphify itself (only `.graphifyignore` if noise emerges)
- No changes to MemPalace, MC, Auto Memory mechanics
- No verbatim transcript ingestion
- No code-graph features (Graphify on `services/*`, `apps/*` stays as-is)
- No deprecation of `docs/plans/spec-shishka-brain*.md` (separate cleanup task)

## 10. Companion Cleanup Tasks (Suggest, Do Not Block)

After this lands, three follow-ups make sense:
1. Rewrite `docs/plans/spec-shishka-brain.md` + `spec-mempalace-phase2.md` + `spec-graphify-phase3.md` to reflect post-LightRAG reality
2. Decide MemPalace MCP fate: wire into `.mcp.json` or deprecate to git-diary-only
3. Audit `vault/_Archive/Blueprints/` and `vault/_Archive/Logs/` for content worth promoting to new vault folders

## 11. Acceptance

- Lesia opens admin panel `/brain/knowledge` and sees a graph that "feels like Shishka", not a code map
- New rule in `agent-rules.md` makes the graph self-maintaining going forward
- Zero existing notes lost (verified by `git diff` on `vault/`)
- Zero new dependencies added

## 12. Estimate

~3 days end-to-end, single agent (`/code` execution). Phase 2 (import) is the longest because of curation quality, not technical work.

## 13. PR Cadence

Phased PRs (CEO-approved 2026-04-28):
1. **PR-1** — Phase 1 (ontology, templates, README, this spec)
2. **PR-2** — Phase 2 (import map sign-off → 50 notes + import script)
3. **PR-3** — Phase 3 + Phase 4 (admin-panel categories + RULE-VAULT-WRITE-ON-CLOSURE)
4. **Phase 5** — verification, no PR (validation-only)
