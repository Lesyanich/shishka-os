# SPEC: Graphify Retirement — full demolition of the graph pipeline, rule, MCP & UI

| | |
|---|---|
| **Status** | APPROVED by CEO 2026-07-18 — awaiting execution |
| **Decided by** | Lesia (CEO), session `claude-opus-session-867ddb45` |
| **Executor** | Any fresh Claude session (NOT the authoring session). Claim MC task first. |
| **MC task (demolition)** | `60da17ab-9c8a-4834-bb75-e82aafc4f085` — claim it, set `spec_file` = this file |
| **MC task (follow-up, separate)** | `2905d250-12c9-4b61-8e8b-8a329849bb98` — human-readable project map. DO NOT do it in this PR. |
| **Cleanup-epic dedup** | Comment posted on `ad32c9c7` (Phase 2 dead-code) telling them to skip graphify paths |
| **Branch** | `feature/cleanup/graphify-retirement` off latest `origin/main` |
| **PR target** | `Lesyanich/shishka-os`, base `main` |
| **DB / migrations** | NONE. This is repo + config + docs only. If you find yourself writing SQL, stop — you're off-spec. |

---

## 1. Decision & evidence (why)

Graphify (knowledge graph of the repo + GRAPH-BEFORE-GREP rule + MCP server + admin `/brain` graph UI) is retired because it is **net-negative for AI efficiency** — its primary stated purpose.

Evidence, verified 2026-07-18:

1. **External A/B test** (same task "find the create-event modal on the calendar page", 5 runs each):
   - WITH graphify (forced by prompt): 37k–52k tokens, avg ~43k
   - WITHOUT graphify: 32k–37k tokens, avg ~34k
   - Mechanism: graph hits are approximate/semantic, so the model still greps + reads files afterward. Graphify **adds** a step, it never replaces one. Cost = graphify + grep + read, vs just grep + read.
2. **The live graph lies about freshness.** `apps/admin-panel/public/graph.json` (4.8 MB, 5,557 nodes, 9,101 edges) was built 2026-07-12 21:54. By 2026-07-18, `origin/main` had **46 commits / 133 changed files** the graph doesn't know — yet `graph_freshness` reported `stale: false` (hardcoded ~7-day threshold, not actual churn). A freshness stamp that says "fresh" when it isn't is worse than no stamp.
3. **Maintenance is manual and gotcha-laden.** No crontab registration exists (`crontab -l` clean). The `shishka-brain-maintenance` skill (`~/.claude/scheduled-tasks/`) was never confirmed scheduled. Historical incidents: graph stale 13 days; "built ≠ live" (worktree builds don't reach the served path); multiprocessing-spawn trap; wrong-repo PR trap.
4. **Passive tax**: ~420 tokens of graphify rules loaded per session × ~20 parallel sessions, plus one stdio MCP process per session holding the 4.8 MB JSON.

CEO's explicit requirements:
- The graphical visualization is NOT needed.
- Any future "brain" must be **human-readable structure** (modules, tables, files, instructions) — that is MC task `2905d250`, out of scope here. The vault wiki (`/brain/wiki`) survives as the readable-brain surface.

---

## 2. Summary: remove / keep / defer

| Category | Verdict |
|---|---|
| GRAPH-BEFORE-GREP rule (CLAUDE.md + operational-rules §LK-GRAPH + skill-advisor rows) | **REMOVE** |
| `shishka-graphify` MCP registration + launch script | **REMOVE** |
| `/graphify` skill (`.claude/skills/graphify/`) | **REMOVE** |
| `services/mcp-graphify/` tracked sources | **REMOVE** (git history preserves) |
| Graph artifacts in `apps/admin-panel/public/` (graph.json 4.8M, graph.html 4.2M, graph-analytics.json) | **REMOVE** (~9 MB out of repo & build) |
| Graph UI: `BrainExplorePage`, `BrainKnowledgePage`, `GraphifyViewer`, `GraphCanvas` + their tests | **REMOVE** |
| `graphify-out/manifest.json`, `.graphifyignore`, `.gitignore` graphify lines | **REMOVE** |
| Maintenance skill `~/.claude/scheduled-tasks/shishka-brain-maintenance/` | **REMOVE** (per-machine, post-merge step) |
| Vault wiki (`/brain/wiki`: `BrainWikiPage`, `PageReader`, `VaultSidebar`) and `/brain/drive` (`BrainDriveMapPage`) | **KEEP** — becomes the primary `/brain` surface |
| `BrainPage.tsx` (layout), `BrainErrorBoundary.tsx`, `BrainPlaceholder.tsx` | **KEEP** (adjust tabs only) |
| Human-readable project map | **DEFER** → MC `2905d250` |

**Accepted loss (flag in PR body, already OK'd by CEO implicitly):** `BrainKnowledgePage` had a tiny local-notes feature (localStorage key `shishka-brain-notes`, device-local, never synced to DB). It dies with the page. Do not build a migration for it.

---

## 3. DO NOT TOUCH

- `vault/.obsidian/graph.json` — this is **Obsidian's own core-plugin config**, coincidental name. Not graphify.
- `docs/plans/_archive/**` (incl. `spec-graphify-phase3.md`) — historical record stays as-is.
- `apps/admin-panel/dist/**` — build output, regenerates.
- Sibling worktrees under `.claude/worktrees/` — they sync when they merge main. Never edit another worktree.
- `STATUS.md` — auto-generated.
- Anything DB-side. No migrations, no Supabase changes.
- Running sessions: ~20 parallel sessions still carry the old rule in-context and may have live graphify MCP processes. Expected transitional state; they die with the sessions. The old rule's own fallback clause ("do not block on the graph") covers them.

---

## 4. Execution phases

Work top-down; commit per phase (small commits, `chore(cleanup): ...`). Line numbers below were verified 2026-07-18 and may drift a few lines — always locate by the quoted anchor text, not the number alone.

### Phase A — Constitution & rules

1. **`CLAUDE.md`** (~line 31): delete the entire bullet
   > `- **GRAPH-BEFORE-GREP:** for "what connects to / depends on / where does X live" questions, try graphify_query_topic first ...`
2. **`docs/constitution/operational-rules.md`**:
   - ~line 507 (§ RULE-SKILL-ADVISOR): the bullet "**Never hand-roll** what a skill/MCP does more reliably (...don't grep the codebase for "what depends on X" when `shishka-graphify` answers it — see GRAPH-BEFORE-GREP)". Keep the bullet, drop the graphify example — keep only the `/finance` receipt example.
   - ~lines 595–607: delete the whole section `## LK-GRAPH: Knowledge Graph (try before grep ...)` up to (not including) `## Dead Zones`.
   - In the `## Dead Zones` table, add a row: `| services/mcp-graphify/ | RETIRED 2026-07-18 — graphify knowledge graph removed (net-negative vs grep, see docs/plans/spec-graphify-retirement.md) |`
   - Grep the whole file for any other `LK-GRAPH` / `graphify` reference (e.g. Context Routing tables) and remove.
3. **`docs/operations/skill-advisor.md`**:
   - ~line 70: delete bullet `**mcp shishka-graphify** (graphify_query_topic) — "what connects to..." GRAPH-BEFORE-GREP.`
   - ~line 129: delete hint-table row `| где находит,что зависит,... | mcp shishka-graphify | ... |` (this row feeds the 💡 UserPromptSubmit hook — removing it kills the auto-hints).
4. **Sweep agents & commands**: `grep -rn "graphify\|GRAPH-BEFORE-GREP" agents/ .claude/commands/ .claude/agents/ docs/operations/ 2>/dev/null` — remove remaining mentions. Note: `.claude/commands/*` are gitignored → if you edit tracked copies elsewhere fine; if a command file is untracked-local, edit it anyway (per-machine hygiene) — see memory `project_skill_advisor` (`git add -f` pattern if a tracked variant exists).

### Phase B — MCP & tooling

1. **Root `.mcp.json`**: remove the entry (verify exact shape before deleting):
   ```json
   "shishka-graphify": { "command": "bash", "args": ["scripts/launch-graphify-mcp.sh"] }
   ```
2. Delete `scripts/launch-graphify-mcp.sh`.
3. Delete `.claude/skills/graphify/` (whole dir, tracked: `SKILL.md`).
4. Delete tracked `services/mcp-graphify/` sources (5 files: `package.json`, `package-lock.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`). `node_modules/` there is untracked — handled post-merge (§6).

### Phase C — Repo artifacts

1. Delete `apps/admin-panel/public/graph.json`, `graph.html`, `graph-analytics.json` (tracked; ~9 MB).
2. Delete `graphify-out/manifest.json`; remove `.gitignore` lines:
   ```
   /graphify-out/*
   !/graphify-out/manifest.json
   ```
3. Delete `.graphifyignore`.

### Phase D — Admin UI (`apps/admin-panel`)

Current state (verified): `/brain` routes in `src/App.tsx` ~lines 129–133: index → `BrainExplorePage`, `knowledge` → `BrainKnowledgePage`, `wiki/*` → `BrainWikiPage`, `drive` → `BrainDriveMapPage`. Lazy imports ~lines 45–49. `GraphifyViewer` is **not routed anywhere** (already-dead code).

1. Delete files:
   - `src/pages/brain/BrainExplorePage.tsx` (graph-dominant explore view)
   - `src/pages/brain/BrainKnowledgePage.tsx`
   - `src/pages/brain/GraphifyViewer.tsx` + `src/pages/brain/__tests__/GraphifyViewer.test.ts`
   - `src/components/brain/GraphCanvas.tsx` + any test of it in `src/components/brain/__tests__/`
2. `src/App.tsx`: remove the `BrainExplorePage` / `BrainKnowledgePage` lazy imports and their `<Route>` lines. Make `/brain` index redirect to the wiki: `<Route index element={<Navigate to="/brain/wiki" replace />} />`. Keep `wiki/*` and `drive` routes untouched. **Use existing `lazyWithReload` for any lazy imports you touch — never raw `lazy()`** (stale-chunk gotcha).
3. `src/pages/brain/index.ts`: drop the `BrainExplorePage` export.
4. `src/pages/brain/BrainPage.tsx`: inspect the tabs array (~line 9 area) — remove Explore/Knowledge tabs if present; keep Wiki + Drive Map.
5. **Shared components check** before deleting anything: `PageReader.tsx` and `VaultSidebar.tsx` are used by the (removed) Explore page — verify `BrainWikiPage` usage: `grep -rn "PageReader\|VaultSidebar" src/ --include="*.tsx"`. If only Explore used one of them AND Wiki doesn't → it becomes an orphan; still **KEEP it** in this PR (minimal-correct-change; the Phase 2 cleanup epic owns orphan pruning).
6. Dependency check: `BrainKnowledgePage` used `vis-network` (`Network`). After deletions run `grep -rn "vis-network\|vis-data" src/` — if zero consumers remain, remove the package(s) from `apps/admin-panel/package.json` + lockfile via `npm uninstall`.

### Phase E — Docs sweep

`grep -rln "graphify" docs/ --exclude-dir=_archive` currently hits: `docs/plans/spec-brain-system.md`, `docs/plans/spec-agents-split.md`, `docs/plans/spec-code-cleanup-security-hardening.md` (+ this spec).

- `spec-brain-system.md`: add a banner at top of the graphify-related sections: `> SUPERSEDED 2026-07-18: graphify retired — see spec-graphify-retirement.md. Vault wiki remains the brain surface.` Do not rewrite the doc.
- The other two: update the specific mention lines to past tense / "retired, see spec-graphify-retirement.md".
- `vault/**` mentions (if any): historical knowledge — leave unless a page actively instructs using graphify; then add the same one-line supersession note.

### Phase F — Memory (auto-memory dir, shared across sessions)

Dir: `/Users/lesianich/.claude/projects/-Users-lesianich-code-shishka/memory/`

1. Rewrite `reference_graphify_brain.md` into a retirement tombstone **modeled on `reference_mempalace_retired.md`**: what it was, why retired (the evidence in §1, condensed), date, pointer to this spec, and the one thing future sessions must know: *"do not resurrect GRAPH-BEFORE-GREP; grep + targeted Read won the A/B"*. Keep `name:` slug unchanged (wikilinks point at it).
2. Update the `MEMORY.md` index line for it accordingly.
3. Grep the memory dir for other `graphify` / `GRAPH-BEFORE-GREP` mentions (e.g. `reference_mcp_portable_config.md`, gotcha files) and fix only lines that would mislead a future session into using graphify.

*(The authoring session already put an "APPROVED, retirement pending" banner on the memory file — replace it with the final tombstone.)*

### Phase G — Verify, Commit Gate, PR

See §5. Then: update MC task `60da17ab` (phase, PR number), ensure docs synced, push, open PR to `Lesyanich/shishka-os` base `main`. PR body: summary table from §2, evidence one-liner, "what to click" (per CEO's preview-before-PR standing feedback), the accepted-loss note about local brain notes, and the ~9 MB repo/bundle diet. Report to CEO in Russian.

---

## 5. Verification (VERIFY-BEFORE-DONE — all must pass)

Run from the executor worktree. **Worktree gotcha: run your own `npm ci` from `apps/admin-panel` — never symlink `node_modules` from the main checkout.**

1. **Build**: FULL `npm run build` in `apps/admin-panel` — green.
2. **Tests**: `npm test` (or the repo's test runner) in `apps/admin-panel` — green; deleted-file tests gone.
3. **Zero live references**:
   ```bash
   grep -rni "graphify" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_archive --exclude-dir=dist . 
   ```
   Expected remaining hits ONLY: this spec, supersession banners added in Phase E, memory tombstone, vault historical mentions. Zero hits in: `apps/`, `services/`, `scripts/`, `.mcp.json`, `.gitignore`, `CLAUDE.md`, `docs/constitution/`, `docs/operations/`.
   ```bash
   grep -rn "graph.json\|graph.html\|graph-analytics" apps/admin-panel/src   # → zero
   ```
4. **Route smoke** (preview server): `/brain` → redirects to `/brain/wiki`, wiki renders vault pages, `/brain/drive` renders, no console errors, `/brain/knowledge` no longer routed (falls through to app's catch-all).
5. **MCP**: start a fresh Claude session in the executor worktree → `shishka-graphify` absent from the MCP server list; no 💡 graphify hints fire on a "what depends on X" message.
6. **No DB drift**: confirm the diff contains zero files under `services/supabase/` and no migrations.

---

## 6. Post-merge manual steps (main checkout + machines — not part of the PR)

1. Main checkout: `git pull`, then remove untracked leftovers:
   ```bash
   rm -rf /Users/lesianich/code/shishka/services/mcp-graphify   # node_modules remnant (~60MB)
   rm -rf /Users/lesianich/code/shishka/graphify-out
   ```
2. Both Macs (MCP config syncs via repo `.mcp.json`, scheduled tasks do NOT):
   ```bash
   rm -rf ~/.claude/scheduled-tasks/shishka-brain-maintenance
   crontab -l | grep -i "graphify\|brain"     # expect empty
   launchctl list | grep -i shishka           # expect no graphify/brain job
   ```
3. Sibling worktrees keep a stale `.mcp.json` until they merge main — their graphify MCP will fail to find `graph.json` and sessions fall back to grep per the old rule's own fallback clause. No action needed.

---

## 7. Acceptance criteria

- [ ] GRAPH-BEFORE-GREP absent from `CLAUDE.md`, `operational-rules.md`, `skill-advisor.md`, agents/commands
- [ ] `services/mcp-graphify` listed in Dead Zones; tracked sources deleted
- [ ] `.mcp.json` has no `shishka-graphify`; launch script and `/graphify` skill deleted
- [ ] `public/graph.json` / `graph.html` / `graph-analytics.json` deleted (~9 MB repo diet)
- [ ] `/brain` = wiki-first; Explore/Knowledge/GraphifyViewer/GraphCanvas deleted; build + tests green
- [ ] `vis-network` removed if orphaned
- [ ] Memory tombstone written; MEMORY.md index updated
- [ ] MC `60da17ab` updated with PR number; Commit Gate honored
- [ ] Post-merge §6 checklist handed to CEO (or executed if session has main-checkout access)
- [ ] Vault Obsidian config, `_archive`, DB — untouched

## 8. Rollback

Single `git revert` of the PR restores everything tracked (rule, MCP entry, artifacts, UI). The graph data itself is frozen at its last build (2026-07-12) in git history — nothing regenerates it after the maintenance skill is deleted, which is the point.
