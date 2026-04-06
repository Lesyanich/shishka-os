# Handoff: COO (Cowork) → Claude Code (PyCharm)
> Date: 2026-04-06 | Author: COO via Cowork

## Current State

- **Branch**: `feature/shared/lightrag-research` (already checked out)
- **Working tree**: dirty (unrelated changes from previous sessions — DO NOT commit them)
- **venv**: lightrag installed in `./venv/`

## Two tasks, strict order

### 1. FIRST: Infra Fix (CRITICAL blocker)
- **MC Task**: `3aef4823-7b68-494e-b5b4-12a692dddf57`
- **Spec**: `docs/plans/spec-claude-code-hygiene.md` — READ THIS FIRST
- **What**: rename `claude.md` → `CLAUDE.md`, clean `.claude/settings.json` from claude-flow bloat, remove untracked bloatware
- **Why**: without this, you (Claude Code) cannot see project context in new sessions

### 2. THEN: LightRAG Research
- **MC Task**: `2e0cb037-7877-49e1-81d5-d0be5e779359`
- **What**: Research LightRAG for agent knowledge retrieval in Shishka OS
- **Previous attempt**: Warp agent installed lightrag but lost all research (no commit, no spec file)
- **Deliverable**: `docs/plans/spec-lightrag.md` — architecture spec covering:
  - What LightRAG is and how it works (graph + vector hybrid RAG)
  - How it fits Shishka OS agents (chef, finance, dispatcher)
  - Integration architecture with our Supabase + MCP stack
  - Pros/cons vs alternatives (plain vector search, full GraphRAG)
  - Recommended implementation phases
- **Context files**: `docs/bible/INDEX.md` (our knowledge system), `docs/constitution/agent-tracking.md`

## Protocol Reminders

1. Read `CLAUDE.md` (root) at session start — it's the context router
2. Read `docs/constitution/p0-rules.md` — immutable rules
3. After completing each task: `update_task` in MC with status + notes
4. Commit on this branch: `feature/shared/lightrag-research`
5. Do NOT `git push` until both tasks done and MC updated

## What NOT to do

- Do NOT touch dirty working tree files (unrelated changes from other sessions)
- Do NOT install claude-flow or any external frameworks
- Do NOT create new branches — stay on `feature/shared/lightrag-research`
