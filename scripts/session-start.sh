#!/bin/sh
# ============================================================
# Shishka OS — Active Session Start Hook
# Runs at every Claude Code session start. Emits JSON to inject
# additionalContext containing:
#   - this session's unique ID (seeded into .claude/.session-id)
#   - live MC in_progress tasks with claimed_by, branch, phase
#   - hard claim-gate warning if any task is owned by another session
#
# Hook event: SessionStart (cannot block; injects context only).
# Output:
#   - stdout = JSON {hookSpecificOutput: {hookEventName, additionalContext}}
#   - stderr = none (visible only on hook errors)
# ============================================================

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# Worktree auto-link: symlink node_modules + .env.local from main checkout
# when running inside a git worktree. No-op in main. Output suppressed to
# keep stdout clean for SessionStart JSON contract.
sh "$REPO_ROOT/scripts/worktree-setup.sh" >/dev/null 2>&1 || true

# --- Read hook payload from stdin (Claude Code SessionStart event) ---
STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(cat 2>/dev/null || true)
fi

CLAUDE_SID=""
SOURCE="startup"
MODEL=""
if [ -n "$STDIN_JSON" ] && command -v jq >/dev/null 2>&1; then
  CLAUDE_SID=$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)
  SOURCE=$(printf '%s' "$STDIN_JSON" | jq -r '.source // "startup"' 2>/dev/null)
  MODEL=$(printf '%s' "$STDIN_JSON" | jq -r '.model // empty' 2>/dev/null)
fi
export CLAUDE_MODEL="$MODEL"

# --- Generate or load this session's unique ID ---
SID_FILE="$REPO_ROOT/.claude/.session-id"
mkdir -p "$REPO_ROOT/.claude" 2>/dev/null || true

# On resume, keep existing ID if file exists. Otherwise generate fresh.
MY_SESSION_ID=""
if [ "$SOURCE" = "resume" ] && [ -f "$SID_FILE" ]; then
  MY_SESSION_ID=$(cat "$SID_FILE" 2>/dev/null || true)
fi
if [ -z "$MY_SESSION_ID" ]; then
  MY_SESSION_ID=$(printf '%s' "$STDIN_JSON" | sh "$REPO_ROOT/scripts/new-session-id.sh" 2>/dev/null || sh "$REPO_ROOT/scripts/new-session-id.sh" "$CLAUDE_SID" < /dev/null)
  printf '%s\n' "$MY_SESSION_ID" > "$SID_FILE"
fi

# --- Git context ---
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "no commits")
DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

# --- Git freshness (best-effort; NEVER blocks the hook, NEVER touches files) ---
# `git fetch` is READ-ONLY: it updates remote-tracking refs only, never your
# working tree. Backgrounded so a slow/offline remote can't delay session start;
# the behind-counts below read refs from the previous fetch and self-heal next
# session. Warns when you're behind so you remember to `git pull` before working.
GIT_FRESHNESS=""
( git fetch --quiet >/dev/null 2>&1 & ) 2>/dev/null || true
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  UPSTREAM=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo "")
  BEHIND=$(git rev-list --count "HEAD..@{u}" 2>/dev/null || echo 0)
  if [ "${BEHIND:-0}" -gt 0 ] 2>/dev/null; then
    GIT_FRESHNESS="⚠️  BEHIND $UPSTREAM by $BEHIND commit(s) — run 'git pull' before working"
  fi
fi
if [ "$BRANCH" != "main" ]; then
  BEHIND_MAIN=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo 0)
  if [ "${BEHIND_MAIN:-0}" -gt 0 ] 2>/dev/null; then
    GIT_FRESHNESS="${GIT_FRESHNESS:+$GIT_FRESHNESS
}ℹ️  origin/main is $BEHIND_MAIN commit(s) ahead — pull/merge main for the latest merged work"
  fi
fi

# --- Fetch live MC in_progress tasks (best-effort; never block) ---
MC_TASKS=""
MC_ERROR=""
SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
SERVICE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null || true)

if [ -n "$SERVICE_KEY" ] && command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  MC_RAW=$(curl -fsS --max-time 5 \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    "$SUPABASE_URL/rest/v1/business_tasks?status=eq.in_progress&select=id,title,related_ids&order=updated_at.desc&limit=20" 2>/dev/null || true)
  if [ -n "$MC_RAW" ]; then
    MC_TASKS=$(printf '%s' "$MC_RAW" | jq -r --arg me "$MY_SESSION_ID" '
      if length == 0 then "  (none)"
      else
        map(
          "  - " + (.id[:8]) + " | " + (.title[:60]) +
          "\n      claimed_by=" + (.related_ids.claimed_by // "—") +
          " phase=" + (.related_ids.phase // "—") +
          " branch=" + (.related_ids.git_branch // "—") +
          (if .related_ids.claimed_by and .related_ids.claimed_by != $me then "  ⚠ OWNED BY ANOTHER SESSION" else "" end)
        ) | join("\n")
      end
    ' 2>/dev/null || true)
  else
    MC_ERROR="(MC unreachable; skipping live conflict check)"
  fi
else
  MC_ERROR="(no SUPABASE_SERVICE_ROLE_KEY or curl/jq missing; skipping live conflict check)"
fi

# --- Persist session marker for session-end.sh ---
SESSION_DIR="$HOME/.shishka-sessions"
mkdir -p "$SESSION_DIR" 2>/dev/null || true
{
  date -u +%Y-%m-%dT%H:%M:%SZ
  git rev-parse HEAD 2>/dev/null || echo "none"
} > "$SESSION_DIR/current"

# --- Build additionalContext for Claude Code ---
CONTEXT=$(cat <<EOF
=== Shishka OS Session Start ===

My session ID: $MY_SESSION_ID
Branch: $BRANCH
Last commit: $LAST_COMMIT
Dirty tree: $DIRTY_COUNT files
Source: $SOURCE${GIT_FRESHNESS:+
$GIT_FRESHNESS}

Live MC tasks (status=in_progress):
${MC_TASKS:-  (no tasks fetched) $MC_ERROR}

CLAIM-GATE RULE (hard, enforced by .claude/hooks/claim-gate-pretool.sh):
  • Tasks marked "OWNED BY ANOTHER SESSION" above MUST NOT be claimed.
  • Trying to update_task(status=in_progress) on such a task will be BLOCKED.
  • If you need that work done — pick a different task or notify the user.

Standard pickup flow:
  1. list_tasks(status='in_progress') — resume only tasks with claimed_by == "$MY_SESSION_ID"
  2. If none yours → list_tasks(status='inbox', priority='critical')
  3. Before working: update_task(status='in_progress', assigned_to='$MY_SESSION_ID', related_ids={claimed_by:'$MY_SESSION_ID', claimed_at:NOW, phase:'context-loading', git_branch:'<branch>'})

Agents: /chef · /finance · /coo · /techlead — or just say what you need.

Skill Advisor (active — RULE-SKILL-ADVISOR):
  • 💡 hints fire automatically per message (UserPromptSubmit hook); at task start, OFFER the fitting tool — do not hand-roll what a skill/MCP does better.
  • Browse the full task→tool catalog any time: docs/operations/skill-advisor.md  (or run /skills <what you need>)
  • For code tasks, the kind→skill REQUIRED/FORBIDDEN map is docs/operations/skills-services-policy.md § Task-Kind Taxonomy.
=== Ready ===
EOF
)

# --- Emit JSON for Claude Code (SessionStart cannot block; additionalContext only) ---
# Use jq to safely encode multi-line context
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$CONTEXT" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: .
    }
  }'
else
  # Fallback: print plain text (Claude Code captures stdout)
  printf '%s\n' "$CONTEXT"
fi
