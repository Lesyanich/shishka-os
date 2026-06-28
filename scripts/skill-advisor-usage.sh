#!/bin/sh
# ============================================================
# Skill Advisor — usage logger (P4)
# PostToolUse hook. Records when a skill / slash-command / MCP
# tool is actually invoked, so /skills-stats can correlate it
# against what the 💡 advisor suggested earlier in the session
# and compute per-tool acceptance rates.
#
# Appends one JSONL line per relevant tool use to
# .claude/.skill-advisor-log.jsonl  (shared with the suggest log).
# Read-only w.r.t. the repo; never blocks. Pure shell + jq.
# ============================================================

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" 2>/dev/null || exit 0
command -v jq >/dev/null 2>&1 || exit 0

STDIN_JSON=""
if [ ! -t 0 ]; then STDIN_JSON=$(cat 2>/dev/null || true); fi
[ -n "$STDIN_JSON" ] || exit 0

TOOL=$(printf '%s' "$STDIN_JSON" | jq -r '.tool_name // empty' 2>/dev/null)
[ -n "$TOOL" ] || exit 0

# Identifier we can match back to a registry tool:
#  - Skill / SlashCommand → the skill or command name from tool_input
#  - mcp__server__method   → the tool_name itself (carries the server)
ID=$(printf '%s' "$STDIN_JSON" | jq -r '
  .tool_input.command // .tool_input.skill // .tool_input.name // .tool_name // empty
' 2>/dev/null)
[ -n "$ID" ] || ID="$TOOL"

SID=$(cat .claude/.session-id 2>/dev/null || echo "nosession")
TS=$(date -u +%s 2>/dev/null || echo 0)
LOG=".claude/.skill-advisor-log.jsonl"

jq -nc --argjson ts "$TS" --arg sid "$SID" --arg tool "$TOOL" --arg id "$ID" \
  '{ts:$ts, session:$sid, kind:"use", tool:$tool, id:$id}' \
  >> "$LOG" 2>/dev/null || true
exit 0
