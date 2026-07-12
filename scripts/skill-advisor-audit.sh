#!/bin/sh
# ============================================================
# Skill Advisor — anti-drift audit
# Compares the ADVISOR-MAP registry against the tools actually
# available in the repo, and flags anything not yet catalogued:
#   - skills    (.claude/skills/*/)
#   - commands  (.claude/commands/*.md)
#   - MCP       (.mcp.json + ~/.claude.json — best-effort)
#
# Two tiers:
#   MISSING    — name not mentioned anywhere in the registry → add it
#   NO TRIGGER — in the catalog prose but absent from ADVISOR-MAP,
#                so the hook can never auto-suggest it
#
# Run: sh scripts/skill-advisor-audit.sh   (or /skills-audit)
# Read-only. Exit 0 always (report-only).
# ============================================================

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" 2>/dev/null || exit 0
REG="docs/operations/skill-advisor.md"
[ -f "$REG" ] || { echo "registry not found: $REG"; exit 0; }

# Lowercased full doc, and just the ADVISOR-MAP block
DOC_LC=$(tr '[:upper:]' '[:lower:]' < "$REG")
MAP_LC=$(awk '/ADVISOR-MAP-START/{m=1;next} /ADVISOR-MAP-END/{m=0} m' "$REG" | tr '[:upper:]' '[:lower:]')

# Generic tokens that must NOT count as "covered" on their own
STOP=" mcp shishka agent skill plugin the and for "

# Intentionally prose-only (routing agents invoked deliberately + via
# CLAUDE.md free-text routing) — not drift, so excluded from NO-TRIGGER.
ACCEPTED=" coo strategy techlead "

# is_in <name> <haystack> → 0 if the full name, or a meaningful
# hyphen-token (>=4 chars, not generic), appears in the haystack
is_in() {
  name=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  hay="$2"
  case "$hay" in *"$name"*) return 0 ;; esac
  oldifs=$IFS; IFS='-'
  for tok in $name; do
    IFS=$oldifs
    [ ${#tok} -ge 4 ] || { IFS='-'; continue; }
    case "$STOP" in *" $tok "*) IFS='-'; continue ;; esac
    case "$hay" in *"$tok"*) return 0 ;; esac
    IFS='-'
  done
  IFS=$oldifs
  return 1
}

MISSING=""; NOTRIG=""
classify() {  # $1=name  $2=kind
  if ! is_in "$1" "$DOC_LC"; then
    MISSING="${MISSING}  - [$2] $1\n"
  elif ! is_in "$1" "$MAP_LC"; then
    case "$ACCEPTED" in *" $1 "*) return ;; esac   # intentionally prose-only
    NOTRIG="${NOTRIG}  - [$2] $1\n"
  fi
}

n_skills=0; n_cmds=0; n_mcp=0
for d in .claude/skills/*/; do
  [ -d "$d" ] || continue
  classify "$(basename "$d")" "skill"; n_skills=$((n_skills + 1))
done
for f in .claude/commands/*.md; do
  [ -f "$f" ] || continue
  classify "$(basename "$f" .md)" "command"; n_cmds=$((n_cmds + 1))
done
MCP_KEYS=$( { jq -r '(.mcpServers // {}) | keys[]' .mcp.json 2>/dev/null
             jq -r '(.mcpServers // {}) | keys[]' "$HOME/.claude.json" 2>/dev/null; } | sort -u )
for k in $MCP_KEYS; do
  [ -n "$k" ] || continue
  classify "$k" "mcp"; n_mcp=$((n_mcp + 1))
done

echo "=== Skill Advisor — anti-drift audit ==="
echo "Registry : $REG"
echo "Inventory: ${n_skills} skills · ${n_cmds} commands · ${n_mcp} MCP servers (MCP best-effort: .mcp.json + ~/.claude.json)"
echo ""
if [ -n "$MISSING" ]; then
  echo "⚠  MISSING from registry — add a row to ADVISOR-MAP:"
  printf '%b' "$MISSING"
else
  echo "✅ MISSING: none — every catalogued tool is mentioned."
fi
echo ""
if [ -n "$NOTRIG" ]; then
  echo "ℹ️  NO TRIGGER ROW — present in prose but not in ADVISOR-MAP (hook can't auto-suggest):"
  printf '%b' "$NOTRIG"
else
  echo "✅ NO TRIGGER: none — every mentioned tool has a trigger row."
fi
echo ""
echo "Tip: anything listed above is drift. Add bilingual (RU+EN) keyword rows to"
echo "the ADVISOR-MAP block in ${REG} (RULE-COMPOUND-ENGINEERING)."
