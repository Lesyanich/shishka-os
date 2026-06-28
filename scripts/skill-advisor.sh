#!/bin/sh
# ============================================================
# Shishka OS — Skill Advisor Hook
# Runs on every user prompt (UserPromptSubmit). Matches the prompt
# against trigger keywords in docs/operations/skill-advisor.md
# (ADVISOR-MAP table) and injects a quiet 💡 hint naming the
# relevant skills/commands/MCP tools.
#
# Behavior:
#   - silent when nothing matches
#   - each tool suggested at most ONCE per session (dedup via
#     .claude/.skill-advisor-seen, keyed on .claude/.session-id)
#   - top 3 matches max, to avoid spam
#   - pure shell/awk, no network, zero token cost
#
# Hook event: UserPromptSubmit (additionalContext injection only).
# Note: ASCII is lowercased for matching; Cyrillic keywords are
# stored lowercase and matched as-is (chat input is typically
# lowercase). This is a gentle hint, not a hard gate.
# ============================================================

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" 2>/dev/null || exit 0

REG="docs/operations/skill-advisor.md"
[ -f "$REG" ] || exit 0

# --- Read prompt from stdin JSON ---
STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(cat 2>/dev/null || true)
fi
[ -n "$STDIN_JSON" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

PROMPT=$(printf '%s' "$STDIN_JSON" | jq -r '.prompt // empty' 2>/dev/null)
[ -n "$PROMPT" ] || exit 0

# Lowercase ASCII (Cyrillic passes through unchanged)
PROMPT_LC=$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')

# --- Per-session dedup file ---
SID=$(cat .claude/.session-id 2>/dev/null || echo "nosession")
SEEN_FILE=".claude/.skill-advisor-seen"
mkdir -p .claude 2>/dev/null || true
if [ -f "$SEEN_FILE" ]; then
  FIRST=$(head -1 "$SEEN_FILE" 2>/dev/null || echo "")
  [ "$FIRST" = "$SID" ] || printf '%s\n' "$SID" > "$SEEN_FILE"
else
  printf '%s\n' "$SID" > "$SEEN_FILE"
fi

# --- Match prompt against ADVISOR-MAP rows (skip already-seen tools) ---
MATCHES=$(awk -v prompt="$PROMPT_LC" -v seenfile="$SEEN_FILE" '
  BEGIN {
    inmap = 0; n = 0;
    while ((getline line < seenfile) > 0) { seen[line] = 1 }
  }
  /ADVISOR-MAP-START/ { inmap = 1; next }
  /ADVISOR-MAP-END/   { inmap = 0 }
  inmap == 1 && /^\|/ {
    split($0, f, "|");           # f[2]=keywords f[3]=tool f[4]=label
    kw = f[2]; tool = f[3]; label = f[4];
    gsub(/^[ \t]+|[ \t]+$/, "", kw);
    gsub(/^[ \t]+|[ \t]+$/, "", tool);
    gsub(/^[ \t]+|[ \t]+$/, "", label);
    if (kw == "keywords" || kw ~ /^-+$/ || tool == "") next;   # header/separator
    if (tool in seen || tool in picked) next;
    kn = split(kw, ks, ",");
    for (i = 1; i <= kn; i++) {
      k = ks[i];
      gsub(/^[ \t]+|[ \t]+$/, "", k);
      if (k != "" && index(prompt, k) > 0) {
        picked[tool] = 1;
        out[++n] = tool "\t" label;
        break;
      }
    }
  }
  END { for (i = 1; i <= n && i <= 3; i++) print out[i] }
' "$REG")

[ -n "$MATCHES" ] || exit 0

# --- Record suggested tools so they are not repeated this session ---
printf '%s\n' "$MATCHES" | cut -f1 >> "$SEEN_FILE"

# --- Build a single-line hint ---
LINE=$(printf '%s\n' "$MATCHES" | awk -F'\t' '{ s = s (s ? "; " : "") $1 " — " $2 } END { print s }')
CONTEXT="💡 Skill Advisor — this message matches ready-made tools: ${LINE}. Offer the user the most fitting one (per RULE-SKILL-ADVISOR); do not run it silently."

# --- Emit JSON for Claude Code ---
printf '%s' "$CONTEXT" | jq -Rs '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: .
  }
}'
