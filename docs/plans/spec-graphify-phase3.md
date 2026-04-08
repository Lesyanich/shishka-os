# Spec: Graphify — L3 Code Structure (Phase 3)

> MC Task: TBD (blocked by `3cc98121` MC RPC bugfix; originally pre-staged in running log comment `4d465fd2`)
> Priority: medium (deferred, not blocking operations)
> Status: spike-planned, awaiting Phase 2 (MemPalace) completion
> Parent: `docs/plans/spec-shishka-brain.md`
> Branch: `feature/shared/graphify-phase3`
> Upstream: https://github.com/safishamsi/graphify
> Blocks: Brain View (`efebcbb1`) L3 tab

## 1. What Graphify Is — and Is Not

### 1.1 Honest framing
Graphify is a **CLI skill for coding agents**, not a RAG server. It builds a structural graph of a codebase using tree-sitter for parsing and NetworkX + Leiden community detection for clustering. Output: local `graph.json` and HTML views.

### 1.2 What it is NOT
- ❌ **Not "a skill built on Karpathy's algorithms"** — that framing came from the README referencing Karpathy's `/raw` folder practice. Architecturally it is NetworkX + Leiden, standard graph algorithms. Marketing ≠ implementation. CEO was briefed on this in Session 5; do not let hype re-anchor scope.
- ❌ **Not a replacement for LightRAG** — LightRAG does semantic retrieval over prose. Graphify does structural analysis over code AST. Different inputs, different outputs, different use cases.
- ❌ **Not a replacement for MemPalace** — Graphify stores no conversations.
- ❌ **Not a retrieval layer for natural-language queries** — it has no embeddings. Queries are graph traversals (e.g., "what calls function X", "what modules depend on module Y"), not semantic search.

### 1.3 What it actually does
| Input | Output |
|---|---|
| `apps/admin-panel/src/` + `services/` | Local `graph.json` with nodes=files/functions/classes, edges=imports/calls/inheritance |
| Same | HTML views with clustered communities (Leiden algorithm) |
| Same | Dead-code candidates (nodes with no incoming edges) |
| Same | High-centrality modules (likely architectural pillars or bottlenecks) |

### 1.4 Where it beats raw Claude code-reading
- Cross-file call graphs that exceed a single chat context window
- Deterministic dead-code detection (Claude guesses; Graphify traverses)
- Community clustering that surfaces accidental coupling
- Stable baseline for "has this module grown?" comparisons over time

## 2. Prerequisites

- Phase 1 (LightRAG) ✅ done and merged
- Phase 2 (MemPalace) done — not strictly required technically, but we want to avoid parallel spikes that splinter attention
- `python3 -m venv` works (isolated install)
- Verified upstream package name — **`graphifyy` (double y)** per Session 5 analysis, confirm at spike step 0

## 3. Spike Plan — 1 Working Day Timebox

### Step 0 — Verify upstream (15 min)
- [ ] `pip index versions graphifyy` and `pip index versions graphify` — confirm which is canonical
- [ ] Read repo README, CHANGELOG, last 10 commits — is it maintained?
- [ ] Check license
- [ ] Search issues for "security", "phone home", "telemetry" — no trust surprises

### Step 1 — Isolated install (15 min)
- [ ] `python3 -m venv services/graphify/.venv`
- [ ] `source services/graphify/.venv/bin/activate`
- [ ] `pip install <verified-package-name>`
- [ ] `graphify --help` — sanity check

### Step 2 — First indexing run (30 min)
- [ ] `graphify install` (if it has an init command)
- [ ] Index `apps/admin-panel/src/` — measure time, output size, graph stats
- [ ] Index `services/` — same
- [ ] Open the HTML view in a browser, screenshot key clusters

### Step 3 — Three evaluation questions (1 hour)

Compare Graphify's answer to raw-Claude reading the same code:

- **Q1 Architectural:** "What are the top 5 most-depended-on modules in `apps/admin-panel/src/`?"
- **Q2 Dead code:** "List functions defined but never called inside `services/mcp-chef/`"
- **Q3 Coupling:** "Which two directories have the heaviest cross-dependency that looks accidental?"

For each, record:
- Graphify answer
- Raw-Claude answer (separate fresh session, no Graphify context)
- Which is more accurate, faster, cheaper in tokens

### Step 4 — Token cost measurement (30 min)
- [ ] Baseline: how many tokens does raw-Claude spend to answer Q1–Q3 without Graphify?
- [ ] With Graphify: how many tokens to feed Graphify's JSON into context and answer?
- [ ] Break-even point: at what codebase size does Graphify pay off?

### Step 5 — Write verdict doc (1 hour)
Create `docs/operations/graphify-spike-2026-XX-XX.md` with:
- Adopt / Wait / Drop verdict
- Evidence from Q1–Q3 comparison
- Token cost table
- Integration recommendation (MCP wrapper? CLI-only? admin dashboard?)
- Known gotchas for future users

### Step 6 — Decision point
- **Adopt** → create follow-up tasks for MCP wrapper, admin dashboard integration, nightly re-index cron
- **Wait** → park task as `low` priority with trigger conditions for revisit (e.g., "when codebase exceeds 50k LoC" or "when we do a multi-module refactor")
- **Drop** → cancel task with rationale, archive spike doc for future reference

## 4. Adopt / Wait / Drop Criteria

### Adopt if:
- Answers Q1–Q3 more accurately than raw-Claude on at least 2 of 3
- Token cost break-even reached at or below current codebase size
- Active upstream (commits in last 3 months)
- MCP wrapping is straightforward (< 4 hours work)

### Wait if:
- Accurate but token-expensive, or codebase too small to benefit today
- Upstream slow but not abandoned
- We already have more pressing knowledge-infrastructure work (likely the case until Brain View ships)

### Drop if:
- Inaccurate answers to Q1–Q3
- Upstream abandoned or malicious patterns found
- Overlaps too much with existing tooling (treegrep, tree-sitter CLI) without adding value

## 5. Integration Vision (if adopted)

```
                 ┌─────────────────────────┐
                 │  Brain View — /brain    │
                 │  admin-panel tab        │
                 └────────┬────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   L1 MemPalace     L2 LightRAG     L3 Graphify
   conversations    bible/domain    code structure
                                         │
                                         ▼
                           services/graphify/.venv
                           (CLI regen nightly)
```

Read path: Brain View reads Graphify's `graph.json` directly (no server needed — it's a flat file) and renders a third force-graph tab.

## 6. Explicit Non-Goals for Phase 3

- ❌ Real-time incremental indexing on every code change — nightly is fine
- ❌ Indexing `docs/` — that's LightRAG's job
- ❌ Indexing conversation history — that's MemPalace's job
- ❌ Building a code-review bot on top of Graphify — out of scope
- ❌ Replacing ESLint or existing static analysis — complementary, not replacement

## 7. Known Risks and Watch-Outs

| Risk | Mitigation |
|---|---|
| `graphifyy` vs `graphify` naming collision | Verify at step 0; document exact package name in verdict doc |
| Karpathy hype colouring evaluation | Pre-commit to §4 criteria before running any tests |
| Leiden clusters reveal embarrassing architectural debt | Good — log it, prioritise refactor tasks, don't shoot the messenger |
| tree-sitter grammar missing for our TypeScript/TSX flavour | Check supported languages at step 0 before install |
| Code graph out of date within hours of ingest | Accepted trade-off for 1-day spike; nightly re-index if adopted |

## 8. Provenance

- Session 5 running log comment `8489a4f2` — initial Graphify routing, three-layer brain architecture introduced, Karpathy framing honestly flagged as marketing
- `4d465fd2` — Graphify spike pre-staged as a running-log comment because MC `emit_business_task` failed on `related_ids` serialization (bug `3cc98121`)
- Session 5 Phase 2 swap: MemPalace chosen as next priority because it bites the bigger operational pain (cross-session context loss) while Graphify remains useful but non-critical
