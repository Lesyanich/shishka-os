# Handoff v2: COO (Cowork) → Claude Code (PyCharm)
> Date: 2026-04-06 | Author: COO via Cowork

## Current State

- **Branch**: `main` (checkout to main first if not already)
- **Working tree**: DIRTY — ~60 modified/deleted files from old sessions (vault archive, agent configs). Deal with this first.
- **Unmerged branch**: `feature/shared/lightrag-research` (2 commits ahead: infra fix + lightrag spec)

## Three tasks, strict order

### 1. FIRST: Clean main + merge lightrag branch

1. Check `git status` on main — understand the dirty tree
2. The dirty files are: vault/_Archive/* deletions, agent config edits, STATUS.md, .DS_Store, etc.
3. Stash or WIP commit these changes: `git stash` or `git add -A && git commit -m "wip: pending changes from previous sessions"`
4. Merge: `git merge feature/shared/lightrag-research --no-ff -m "Merge feature/shared/lightrag-research — CLAUDE.md fix + LightRAG research spec"`
5. Push: `git push origin main`

### 2. THEN: Verify AI-Native Ops (CRITICAL)

- **MC Task**: `58d77460-55f8-42a2-9a27-022010386baf`
- **Spec**: `docs/plans/spec-ai-native-ops-verification.md` — READ THIS, contains full checklist
- **What**: Audit every component from Phases A-D — which ones actually enforce rules in code vs paper-only
- **Related**: Initiative `a27e85db`, spec `docs/plans/spec-ai-native-ops.md`
- **Deliverable**: Filled checklist (✅/❌) + new MC tasks for each ❌ item

Key checks:
- `.husky/` directory exists? pre-commit/post-commit hooks work?
- ESLint domain boundaries enforced?
- AI-TDD gate blocks commits without tests?
- `generate_status` MCP tool exists and runs on post-commit?
- `.github/workflows/ci.yml` exists?

### 3. Fix ❌ items (if time allows)

Based on audit results, create branch `feature/shared/ai-native-ops-fixes` and implement real enforcement for items that are paper-only.

## Protocol Reminders

1. Read `CLAUDE.md` (root, UPPERCASE now!) — context router
2. Read `docs/constitution/p0-rules.md` — immutable rules
3. After each task: `update_task` in MC with status + notes
4. Do NOT install claude-flow or external frameworks
5. Commit messages: descriptive, in English, no emoji

## What NOT to do

- Do NOT create new branches for task 1 (merge happens on main)
- Do NOT modify any guard rail rules without audit first
- Do NOT close initiative a27e85db until audit proves real enforcement
