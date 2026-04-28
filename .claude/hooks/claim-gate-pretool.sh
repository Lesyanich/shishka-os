#!/bin/sh
# ============================================================
# Shishka OS — Claim Gate Enforcement Hook
# Hook event: PreToolUse
# Matcher:    mcp__shishka-mission-control__update_task
#
# Intercepts every attempt to update an MC task. If the call is
# trying to claim a task (status=in_progress) that is already
# claimed by ANOTHER active session, blocks the tool call via
# stdout JSON with permissionDecision=deny + clear reason.
#
# Stale claims (claimed_at > 2h ago) are NOT blocked — the
# requesting session is treated as a legitimate stale takeover
# (CEO-approved per spec: stale window allows recovery).
#
# Failure modes (no session ID, MC unreachable, jq missing) are
# fail-OPEN — we never block on infrastructure errors, only on
# proven collisions.
# ============================================================

set -e

# --- Read hook payload from stdin ---
[ -t 0 ] && exit 0   # No stdin → not invoked as hook → noop
PAYLOAD=$(cat 2>/dev/null || true)
[ -z "$PAYLOAD" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0   # Fail-open if jq missing

TOOL=$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // empty')
[ "$TOOL" = "mcp__shishka-mission-control__update_task" ] || exit 0   # Wrong tool → noop

NEW_STATUS=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.status // empty')
TASK_ID=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.task_id // empty')
INCOMING_CLAIMED_BY=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.related_ids.claimed_by // empty')
[ -z "$TASK_ID" ] && exit 0   # No task_id → let MC reject with its own error

# Only police status transitions toward in_progress (the actual claim moment)
[ "$NEW_STATUS" = "in_progress" ] || exit 0

# --- Load my session ID ---
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SID_FILE="$REPO_ROOT/.claude/.session-id"
MY_SESSION_ID=""
[ -f "$SID_FILE" ] && MY_SESSION_ID=$(cat "$SID_FILE" 2>/dev/null || true)

# Fail-open if we don't know who we are (better than blocking everything)
[ -z "$MY_SESSION_ID" ] && exit 0

# --- Fetch current task state from MC ---
SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
SERVICE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null || true)
[ -z "$SERVICE_KEY" ] && exit 0   # Fail-open if no key

TASK_JSON=$(curl -fsS --max-time 5 \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/business_tasks?id=eq.$TASK_ID&select=id,status,updated_at,related_ids" 2>/dev/null || true)
[ -z "$TASK_JSON" ] && exit 0   # Fail-open on network error

CURRENT_CLAIMED_BY=$(printf '%s' "$TASK_JSON" | jq -r '.[0].related_ids.claimed_by // empty' 2>/dev/null)
# Liveness via updated_at (auto-refreshed by Supabase on every update_task call —
# any phase/notes/comment update from the live agent counts as a heartbeat).
CURRENT_UPDATED_AT=$(printf '%s' "$TASK_JSON" | jq -r '.[0].updated_at // empty' 2>/dev/null)
CURRENT_STATUS=$(printf '%s' "$TASK_JSON" | jq -r '.[0].status // empty' 2>/dev/null)
CURRENT_BRANCH=$(printf '%s' "$TASK_JSON" | jq -r '.[0].related_ids.git_branch // empty' 2>/dev/null)

# --- Decision logic ---
# Block ONLY if:
#   - task is currently in_progress
#   - claimed by someone other than me
#   - claim is fresh (within 2h)
#   - I'm not explicitly trying to take it over with my own session ID

# No existing claim → allow (fresh claim)
[ -z "$CURRENT_CLAIMED_BY" ] && exit 0

# Already mine → allow (re-update, phase change, etc.)
[ "$CURRENT_CLAIMED_BY" = "$MY_SESSION_ID" ] && exit 0

# Task not in_progress (e.g. inbox or done — stale data) → allow
[ "$CURRENT_STATUS" = "in_progress" ] || exit 0

# Stale check: if updated_at > 2h ago, allow takeover.
# SAFE-BY-DEFAULT: if date parse fails, treat as FRESH (block), not stale.
# Why updated_at not claimed_at: Supabase auto-bumps updated_at on every write
# (phase, notes, comments). claimed_at is set once and never refreshes — so an
# active agent working for 3h would falsely look stale by claimed_at alone.
if [ -n "$CURRENT_UPDATED_AT" ]; then
  TS_NORM="${CURRENT_UPDATED_AT%%.*}"
  TS_NORM="${TS_NORM%Z}"
  UPDATED_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "$TS_NORM" "+%s" 2>/dev/null || echo "0")
  if [ "$UPDATED_EPOCH" -gt 0 ]; then
    NOW_EPOCH=$(date -u +%s)
    AGE_SEC=$(( NOW_EPOCH - UPDATED_EPOCH ))
    if [ "$AGE_SEC" -gt 7200 ]; then
      exit 0   # Stale → allow takeover
    fi
  fi
  # If parse failed (UPDATED_EPOCH=0) → treat as fresh, fall through to block
fi

# --- Collision confirmed: block via JSON deny ---
REASON="Task $TASK_ID is currently claimed by '$CURRENT_CLAIMED_BY' (you are '$MY_SESSION_ID') on branch '${CURRENT_BRANCH:-unknown}'. Per multi-agent coordination protocol, you MUST NOT take over a task held by an active session. Pick a different task, or ask the CEO if you believe the other session is dead."

jq -n --arg reason "$REASON" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'
exit 0
