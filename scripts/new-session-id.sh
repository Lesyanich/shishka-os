#!/bin/sh
# ============================================================
# Shishka OS — Unique Claude Code Session ID Generator
# Used by session-start.sh and any tool that needs a stable,
# globally-unique session ID for multi-agent coordination.
#
# Format: claude-{model}-session-{suffix}
#   suffix = first 8 chars of Claude's own session_id (preferred)
#   fallback = MMDD-HHMM-rand4 (e.g. 0428-1050-700d)
#
# Usage:
#   ./scripts/new-session-id.sh                  # standalone (date+rand)
#   ./scripts/new-session-id.sh <claude_sid>     # hook-driven (uses Claude sid)
#   echo '<json>' | ./scripts/new-session-id.sh  # parses session_id+model from JSON stdin
# ============================================================

CLAUDE_SID="$1"
MODEL="${CLAUDE_MODEL:-}"

# If no arg, try reading JSON from stdin (SessionStart hook payload)
if [ -z "$CLAUDE_SID" ] && [ ! -t 0 ]; then
  STDIN_JSON=$(cat 2>/dev/null)
  if [ -n "$STDIN_JSON" ] && command -v jq >/dev/null 2>&1; then
    CLAUDE_SID=$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)
    [ -z "$MODEL" ] && MODEL=$(printf '%s' "$STDIN_JSON" | jq -r '.model // empty' 2>/dev/null)
  fi
fi

# Strip "claude-" prefix and trailing version digits to get short name
# claude-sonnet-4-6 → sonnet ; claude-opus-4-7 → opus
MODEL_SHORT="opus"
if [ -n "$MODEL" ]; then
  MODEL_SHORT=$(printf '%s' "$MODEL" | sed -E 's/^claude-//; s/-?[0-9].*$//')
  [ -z "$MODEL_SHORT" ] && MODEL_SHORT="opus"
fi

# Build suffix: prefer Claude's own session_id (already globally unique)
if [ -n "$CLAUDE_SID" ] && [ "$CLAUDE_SID" != "null" ]; then
  SUFFIX=$(printf '%s' "$CLAUDE_SID" | tr -d '-' | cut -c1-8)
else
  SUFFIX="$(date -u +%m%d-%H%M)-$(openssl rand -hex 2)"
fi

printf 'claude-%s-session-%s\n' "$MODEL_SHORT" "$SUFFIX"
