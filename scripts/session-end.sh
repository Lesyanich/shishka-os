#!/bin/sh
# ============================================================
# Shishka OS — Session End Auto-Capture
# Captures git activity since session start → MemPalace diary.
# ============================================================

SESSION_DIR="$HOME/.shishka-sessions"
SESSION_FILE="$SESSION_DIR/current"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

# Need both session marker and repo
[ -f "$SESSION_FILE" ] || exit 0
[ -n "$REPO_ROOT" ] || exit 0

# Read session start data
SESSION_START=$(head -1 "$SESSION_FILE")
START_SHA=$(tail -1 "$SESSION_FILE")

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "none")

# Skip if no commits were made this session
[ "$START_SHA" = "$CURRENT_SHA" ] && {
  rm -f "$SESSION_FILE"
  exit 0
}

# Collect commits since session start
COMMITS=$(git log --oneline "$START_SHA..$CURRENT_SHA" 2>/dev/null)
COMMIT_COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')
FILES_CHANGED=$(git diff --stat "$START_SHA..$CURRENT_SHA" 2>/dev/null | tail -1)

# Write to MemPalace via Python (pass data through env to avoid injection)
MEMPALACE_VENV="$REPO_ROOT/services/mempalace/.venv/bin/python"
if [ -x "$MEMPALACE_VENV" ]; then
  export _MP_SESSION_START="$SESSION_START"
  export _MP_SESSION_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export _MP_BRANCH="$BRANCH"
  export _MP_COMMIT_COUNT="$COMMIT_COUNT"
  export _MP_COMMITS="$COMMITS"
  export _MP_FILES_CHANGED="$FILES_CHANGED"

  "$MEMPALACE_VENV" -c "
import os
from mempalace.mcp_server import tool_diary_write
entry = (
    f'Session: {os.environ[\"_MP_SESSION_START\"]} → {os.environ[\"_MP_SESSION_END\"]}\n'
    f'Branch: {os.environ[\"_MP_BRANCH\"]}\n'
    f'Commits ({os.environ[\"_MP_COMMIT_COUNT\"]}):\n'
    f'{os.environ[\"_MP_COMMITS\"]}\n'
    f'Summary: {os.environ[\"_MP_FILES_CHANGED\"]}'
)
tool_diary_write(agent_name='claude-code', entry=entry, topic='session-log')
" 2>/dev/null
fi

# Clean up session marker
rm -f "$SESSION_FILE"

echo "[auto-capture] Session diary saved to MemPalace ($COMMIT_COUNT commits)"
