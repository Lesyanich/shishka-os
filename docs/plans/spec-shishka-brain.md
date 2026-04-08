# Spec: Shishka Brain v2 — Three-Layer Memory Architecture

> MC Initiative: TBD (blocked by `3cc98121` MC RPC bugfix)
> Priority: high
> Status: Phase 1 ✅, Phase 2 ✅, Phase 3 deferred
> Branch: `feature/shared/shishka-brain` (umbrella)
> Related:
> - `docs/plans/spec-lightrag.md` (Phase 1, ✅ done)
> - `docs/plans/spec-mempalace-phase2.md` (Phase 2)
> - `docs/plans/spec-graphify-phase3.md` (Phase 3)
> - `agents/coo/AGENT.md` (COO Running Log is interim L1 until MemPalace ships)

## 1. Problem Statement

Shishka is an AI-native operation. Every business decision, every recipe iteration, every supplier negotiation passes through an AI agent. Without a deliberate memory layer, each new session starts cold and CEO becomes the human bus — manually re-explaining context, re-linking files, re-surfacing decisions. This bottleneck is already biting:

- COO Running Log is a manual hand-written fallback for conversation memory
- CEO re-explains same concepts across sessions (kitchen philosophy, storage constraints, model choices)
- Agents cannot answer "what did we decide last time about X" without CEO retelling
- Knowledge trapped in chat transcripts is effectively lost once the session ends

**Shishka Brain v2** is the explicit architecture that replaces this with three orthogonal, addressable memory layers.

## 2. Architecture — Three Orthogonal Layers

Each layer answers a different kind of question. None of them replaces another.

| Layer | Tool | Stores | Answers | Phase |
|---|---|---|---|---|
| **L1 Conversations** | MemPalace | Verbatim agent↔CEO transcripts, decisions, preferences, session artefacts | "What did we decide last time about X?" "What does the CEO hate in Y?" "Why did we pick Z three months ago?" | **Phase 2** |
| **L2 Project Knowledge** | LightRAG | `docs/bible/`, `docs/domain/`, business rules, SOPs | "What is L1-BL-FRZ-790-66?" "What fats are allowed in the kitchen?" "What is our language contract?" | **Phase 1 ✅** |
| **L3 Code Structure** | Graphify | `apps/`, `services/`, code AST, call graphs, module deps | "Where is receipt parsing defined?" "What calls `emit_business_task`?" "Show me the dead-code clusters" | **Phase 3** |

**Not a memory layer** (deliberate):

- **MC tasks** = action ledger. Records *what needs doing* or *what was done*. Not *what was learned*. Comments are not memory — Running Log is an emergency fallback, not a destination.
- **`~/.claude/.../memory/`** = Claude-private auto-memory. Persistent across sessions for Claude only, not shared with other agents, not discoverable by humans. Great for user profile and feedback patterns; wrong layer for shared project memory.

## 3. Design Principles

### 3.1 Orthogonality
Each layer has a clear, non-overlapping responsibility. No layer is a fallback for another. If something belongs in L2 (project knowledge), putting it in L1 (conversation memory) is a leak that costs accuracy and tokens later.

### 3.2 Additive, not replacement
We do not swap tools. We stack them. LightRAG is not replaced by Graphify; Graphify is not replaced by MemPalace. The `shishka-brain` MCP gateway (future) will route queries to the right layer based on intent.

### 3.3 Local-first, private by default
All three layers run locally on the CEO's Mac (or a future dedicated brain box). No mandatory cloud round-trips for inference or storage. Encrypted backups to GDrive for disaster recovery only.

### 3.4 Verbatim over summary
Especially for L1. Summarisation is lossy and cannot be undone. Store raw; compress on query.

### 3.5 Pre-ingest filtering for secrets and PII
Every layer that stores verbatim content must pass through a pre-ingest filter for secrets, credentials, salary amounts, and supplier prices tied to individuals. See per-phase specs.

### 3.6 Discoverability
Architectural decisions live in `docs/plans/spec-*.md`, not in MC comments. Inlined specs in MC comments are emergency fallbacks only — within one session they must be promoted to real spec files. (Compound-engineering rule learned from this session's recovery; to be added to `docs/constitution/agent-rules.md`.)

## 4. Phase Order and Rationale

### Phase 1 — LightRAG (L2 Project Knowledge) — ✅ DONE
- Indexes `docs/bible/` + `docs/domain/` (19 files, 43 nodes, 18 edges)
- Server on `:9621`, `gemma4:e2b` + `bge-m3`, Supabase pgvector backend
- Phase 1 quality gate still pending (Q1 forbidden ingredients, Q2 fats synthesis, Q3-A operations.md)
- PR #29 open, awaiting merge
- **Known limitation:** `operations.md` injected via `ainsert_custom_kg` (Option E), absent from `GET /documents`. Brain View must handle gracefully.
- **Phase 1.5 trigger:** if quality gate fails on Q2, re-ingest through Anthropic API + Claude Haiku as extraction LLM. See `docs/plans/spec-lightrag.md` §Phase 1.5.

### Phase 2 — MemPalace (L1 Conversations) — ✅ DONE
**Why Phase 2, not Graphify:** MemPalace bites the bigger pain. Cross-session context loss is the exact thing COO Running Log fights manually every session. Graphify is a code-intelligence tool — useful but not critical-path until we are actively refactoring multi-module code with agents.

See `docs/plans/spec-mempalace-phase2.md` for install, storage, and spike plan. Shipped on `feature/shared/mempalace-phase2` (MC `30f177b3`). All §6 acceptance criteria met: backup round-trip green, pre-ingest filter rejects known-secrets fixture, agent routing tables added to COO/Chef/Finance, CLAUDE.md L0 wake-up step wired, Session 5 bootstrap ingested into wing `Shishka` (32 drawers across `technical`/`architecture`/`general` rooms), all three CEO quality-gate questions answered with source attribution.

### Phase 3 — Graphify (L3 Code Structure) — DEFERRED
Timebox: 1-day spike after Phase 2 ships. Criteria: adopt / wait / drop. Not blocking any current operational work. See `docs/plans/spec-graphify-phase3.md`.

## 5. Storage Architecture (per layer)

| Layer | Live Data | Backup | Keys |
|---|---|---|---|
| **L1 MemPalace** | `~/.mempalace/` on Mac (FileVault ✅ on) | nightly `age`-encrypted tarball → `_backups/mempalace/*.tar.age` on GDrive | Apple Keychain Secure Note "MemPalace age private key" |
| **L2 LightRAG** | Supabase Postgres + pgvector (`public.lightrag_*`, workspace `lightrag`) | Supabase native backups | Supabase service keys (already in `.env`) |
| **L3 Graphify** | Local `graph.json` + HTML views (path TBD during spike) | trivial — regenerate from code anytime | none — no secrets stored |

**⚠ Watch: LightRAG `services/lightrag/rag_storage/` is currently on GDrive.** Pgvector itself is in Supabase (safe), but the local KV state (graph file, logs, cache) sits on a synced folder. Low-risk for now (not a multi-file transactional DB), but unhealthy as a pattern. Track as a separate post-Phase-1 cleanup task.

## 6. Security Posture

- **FileVault** on the Mac: ✅ verified enabled (2026-04-08)
- **Secrets manager:** Apple Keychain baseline (free, native). 1Password deferred until team grows past CEO OR supplier-portal count exceeds 5 OR sensitive `.env` files exceed 5.
- **Pre-ingest filter:** regex blocklist for secrets, full PII, salary amounts, supplier-price-to-name links. Design pending during Phase 2 spike. MUST exist before first verbatim ingest.
- **Shared-drive leak surface:** all three layers explicitly avoid placing writable DB state on GDrive. Only `age`-encrypted archives go to shared storage.
- **Per-layer RLS:** LightRAG RLS planned in `9df2c5ff`. MemPalace is local-only, no network RLS needed. Graphify is read-only over code.

## 7. Access Pattern — Future MCP Gateway (Phase 4, not scoped yet)

Once all three layers are live, a unified MCP server `shishka-brain` will front them:

```
agent asks: "how did we fix the gemma4 OOM crash?"
              ↓
shishka-brain router
              ↓
  ├── L1 MemPalace  (keyword "gemma4 crash" → session transcripts)
  ├── L2 LightRAG   (semantic "ollama model memory" → bible/engineering-rules)
  └── L3 Graphify   (identifier "gemma4" → code refs)
              ↓
    unified response with source attribution per layer
```

**Not building this yet.** Phase 4 spec comes after all three layers are individually proven.

## 8. Success Criteria for the Overall Initiative

- [ ] All three layers installed, running, backed up
- [ ] Each layer passes its own quality gate (see per-phase specs)
- [ ] Brain View (`efebcbb1`) renders at least L2 graph and L1 conversation clusters
- [ ] Pre-ingest filter implemented and tested with a known-secret corpus
- [ ] `agents/*/AGENT.md` updated to query the right layer per question class
- [ ] COO Running Log becomes optional — sessions start by querying MemPalace instead of reading 15+ manual comments

## 9. Explicit Non-Goals

- ❌ Cloud-hosted production LightRAG / MemPalace (deferred in `7d01042a`)
- ❌ Multi-user sharing of memory across team members (single-user phase)
- ❌ Real-time embedding refresh on every code change (batch, nightly)
- ❌ Replacing MC tasks with MemPalace — they are different tools for different jobs
- ❌ Using Brain View as a write interface (read-only visualization)

## 10. Open Questions

- **Q1:** Does MemPalace share MCP namespace with existing `shishka-*` servers, or live in its own? (Decide during Phase 2 spike step 1.)
- **Q2:** When quality gate for Phase 1 runs, if Q2 fails, do we block Phase 2 on Phase 1.5 re-ingest, or start Phase 2 in parallel? Recommend: start in parallel — they touch different code paths.
- **Q3:** How does Chef Agent know which layer to query? Hard-coded routing in `AGENT.md` initially, then Phase 4 gateway.
- **Q4:** Graphify `pip install` package name is `graphifyy` (double y per Session 5 analysis) — verify during Phase 3 spike step 0.

## 11. Provenance

This spec was extracted from COO Running Log Session 5 comments (2026-04-08) after CEO flagged that the architecture decisions had become non-discoverable (trapped in 6 inline MC comments instead of a discoverable `docs/plans/spec-*.md`). This is the compound-engineering lesson that drove promotion to a real spec file.

- `8489a4f2` — Graphify initial routing (three-layer introduced)
- `25fea4a3` — MemPalace introduced, phase pivot accepted
- `d45d0fc2` — Storage decisions locked (B+ Mac live + age-encrypted backups)
- `1e7d385a` + `9fdf8b6f` — Session 5 final handoff
- `007d796d` — Session 5 post-LightRAG close
