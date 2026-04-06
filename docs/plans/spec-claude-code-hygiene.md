# Spec: Claude Code Hygiene — CLAUDE.md casing + settings cleanup

> MC Task: `3aef4823-7b68-494e-b5b4-12a692dddf57`
> Priority: CRITICAL — blocker for all future Claude Code sessions
> Branch: `feature/shared/lightrag-research` (already checked out)

## Problem

Warp-сессия 2026-04-06 показала: Claude Code не видит проектный контекст.
Корневые причины:

1. `claude.md` в git трекается lowercase → Claude Code ищет `CLAUDE.md`
2. `.claude/settings.json` захвачен claude-flow (200+ строк чужого конфига)
3. 30+ нетрекнутых `.claude/skills/` папок (bloatware)

## Tasks (execute in order)

### Task 1: Rename claude.md → CLAUDE.md

```bash
git mv claude.md CLAUDE.md
```

Verify: `git status` shows rename, `cat CLAUDE.md` shows Shishka OS context.

### Task 2: Clean .claude/settings.json

Current file is polluted with claude-flow config (swarm, hooks, daemon, neural, ddd, agent-teams, etc.).

**KEEP only:**
```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

**REMOVE everything else:**
- All `hooks` (claude-flow hook-handler.cjs, auto-memory-hook.mjs, statusline.cjs)
- `statusLine` section
- `attribution` section (claude-flow branding)
- `env` section (CLAUDE_FLOW_* vars)
- `claudeFlow` section (entire block)
- `permissions.allow` entries for claude-flow (`npx @claude-flow*`, `mcp__claude-flow__:*`)

### Task 3: Clean untracked claude-flow artifacts

```bash
# Remove untracked bloatware dirs
rm -rf .claude-flow/
rm -rf .claude/skills/agentdb-*/
rm -rf .claude/skills/browser/
rm -rf .claude/skills/github-*/
rm -rf .claude/skills/hooks-automation/
rm -rf .claude/skills/pair-programming/
rm -rf .claude/skills/reasoningbank-*/
rm -rf .claude/skills/skill-builder/
rm -rf .claude/skills/sparc-methodology/
rm -rf .claude/skills/stream-chain/
rm -rf .claude/skills/swarm-*/
rm -rf .claude/skills/v3-*/
rm -rf .claude/skills/verification-quality/
```

Verify: `git status` should no longer show these as untracked.

### Task 4: Add .claudeignore protection

Check if `.claudeignore` already blocks these patterns. If not, add:

```
.claude-flow/
venv/
```

### Task 5: Commit

```bash
git add CLAUDE.md .claude/settings.json .claudeignore
git commit -m "fix(infra): rename claude.md→CLAUDE.md, clean claude-flow pollution from settings

Claude Code не видел CLAUDE.md (lowercase в git). settings.json был захвачен
claude-flow конфигурацией. Очистка до минимального конфига (только permissions/deny)."
```

## Success Criteria

- `CLAUDE.md` (uppercase) трекается в git и видим Claude Code
- `.claude/settings.json` содержит ТОЛЬКО permissions deny
- Нет claude-flow артефактов в рабочей директории
- Claude Code при старте читает CLAUDE.md → знает про Shishka OS, ветки, протоколы

## After this task

Proceed to MC task `2e0cb037` (LightRAG research) on the same branch.
