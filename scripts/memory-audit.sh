#!/bin/sh
# ============================================================
# Shishka OS — Memory Layer Audit (WS-2)
#
# Read-only audit of agent auto-memory files at
# $HOME/.claude/projects/<encoded>/memory/*.md
#
# Surfaces:
#   - Total count, by type (feedback / project / user / reference)
#   - With/without `last_verified:` frontmatter
#   - Stale (>60 days from last_verified, or mtime fallback)
#   - Suspected contradictions (overlapping name prefixes)
#
# Usage:
#   bash scripts/memory-audit.sh           — human-readable text
#   bash scripts/memory-audit.sh --json    — machine output (for /health)
#   bash scripts/memory-audit.sh --stale-only   — print just stale list
#
# Spec: WS-2 of Shishka OS Brain Reorganization (MC: 70ede096)
# ============================================================

set -e

JSON_OUTPUT=false
STALE_ONLY=false
TTL_DAYS=60
case "${1:-}" in
  --json) JSON_OUTPUT=true ;;
  --stale-only) STALE_ONLY=true ;;
  --ttl) TTL_DAYS="${2:-60}" ;;
esac

# ----------------------------------------------------------------
# Locate memory dir
# ----------------------------------------------------------------
MEM_DIR=""
for d in "$HOME"/.claude/projects/*hishka*/memory "$HOME"/.claude/projects/*Shishka*/memory; do
  [ -d "$d" ] || continue
  MEM_DIR="$d"
  break
done

if [ -z "$MEM_DIR" ]; then
  if [ "$JSON_OUTPUT" = "true" ]; then
    echo '{"error":"memory dir not found","mem_dir":null}'
  else
    echo "Memory dir not found under \$HOME/.claude/projects/*hishka*/memory"
  fi
  exit 1
fi

# ----------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------

mtime_epoch() {
  if [ "$(uname)" = "Darwin" ]; then
    stat -f %m "$1" 2>/dev/null || echo 0
  else
    stat -c %Y "$1" 2>/dev/null || echo 0
  fi
}

# Extract last_verified date (YYYY-MM-DD) from frontmatter; empty if missing.
# Reads only the YAML block between the first two '---' lines.
parse_last_verified() {
  awk '
    /^---$/ { c++; if (c==2) exit; next }
    c==1 && /^last_verified:/ {
      sub(/^last_verified:[ \t]+/, "")
      gsub(/["\047]/, "")
      print
      exit
    }
  ' "$1"
}

parse_type() {
  awk '
    /^---$/ { c++; if (c==2) exit; next }
    c==1 && /^type:/ {
      sub(/^type:[ \t]+/, "")
      gsub(/["\047]/, "")
      print
      exit
    }
  ' "$1"
}

# Convert YYYY-MM-DD to epoch (cross-platform-ish)
date_to_epoch() {
  d="$1"
  [ -z "$d" ] && { echo 0; return; }
  if [ "$(uname)" = "Darwin" ]; then
    date -j -f "%Y-%m-%d" "$d" "+%s" 2>/dev/null || echo 0
  else
    date -d "$d" +%s 2>/dev/null || echo 0
  fi
}

# ----------------------------------------------------------------
# Walk memory dir
# ----------------------------------------------------------------

NOW=$(date +%s)
TTL_SECS=$(( TTL_DAYS * 86400 ))

TOTAL=0
WITH_LV=0
WITHOUT_LV=0
STALE=0
COUNT_FEEDBACK=0
COUNT_PROJECT=0
COUNT_USER=0
COUNT_REFERENCE=0
COUNT_OTHER=0

# Buffers (newline-delimited)
STALE_LIST=""
MISSING_LV_LIST=""

for f in "$MEM_DIR"/*.md; do
  [ -f "$f" ] || continue
  bn=$(basename "$f")
  [ "$bn" = "MEMORY.md" ] && continue

  TOTAL=$(( TOTAL + 1 ))

  lv=$(parse_last_verified "$f")
  type=$(parse_type "$f")

  case "$type" in
    feedback) COUNT_FEEDBACK=$(( COUNT_FEEDBACK + 1 )) ;;
    project)  COUNT_PROJECT=$(( COUNT_PROJECT + 1 )) ;;
    user)     COUNT_USER=$(( COUNT_USER + 1 )) ;;
    reference) COUNT_REFERENCE=$(( COUNT_REFERENCE + 1 )) ;;
    *)        COUNT_OTHER=$(( COUNT_OTHER + 1 )) ;;
  esac

  if [ -n "$lv" ]; then
    WITH_LV=$(( WITH_LV + 1 ))
    ts=$(date_to_epoch "$lv")
    age_days=$(( ( NOW - ts ) / 86400 ))
    if [ "$age_days" -gt "$TTL_DAYS" ]; then
      STALE=$(( STALE + 1 ))
      STALE_LIST="${STALE_LIST}${bn}|${age_days}|${lv}\n"
    fi
  else
    WITHOUT_LV=$(( WITHOUT_LV + 1 ))
    # Use mtime as fallback freshness
    mts=$(mtime_epoch "$f")
    age_days=$(( ( NOW - mts ) / 86400 ))
    MISSING_LV_LIST="${MISSING_LV_LIST}${bn}|${age_days}\n"
    if [ "$age_days" -gt "$TTL_DAYS" ]; then
      STALE=$(( STALE + 1 ))
    fi
  fi
done

# ----------------------------------------------------------------
# Contradiction detection (heuristic)
# Group files by 2-token prefix; flag groups with 2+ files.
# E.g. feedback_coo_handoff_short, feedback_coo_handoff_long → group "feedback_coo".
# ----------------------------------------------------------------

CONTRADICTION_LIST=$(
  for f in "$MEM_DIR"/*.md; do
    [ -f "$f" ] || continue
    bn=$(basename "$f" .md)
    [ "$bn" = "MEMORY" ] && continue
    # Take first 2 underscore-separated tokens
    prefix=$(echo "$bn" | awk -F_ '{print $1"_"$2}')
    echo "$prefix $bn"
  done | sort | awk '
    NR==1 { last_prefix=$1; group=$2; count=1; next }
    {
      if ($1 == last_prefix) {
        group=group", "$2
        count++
      } else {
        if (count >= 2) print last_prefix": "group" ("count" files)"
        last_prefix=$1; group=$2; count=1
      }
    }
    END { if (count >= 2) print last_prefix": "group" ("count" files)" }
  '
)
CONTRADICTION_COUNT=$(echo "$CONTRADICTION_LIST" | grep -c . || echo 0)
[ -z "$CONTRADICTION_LIST" ] && CONTRADICTION_COUNT=0

# ----------------------------------------------------------------
# Render
# ----------------------------------------------------------------

# Stale-only mode (used by automation)
if [ "$STALE_ONLY" = "true" ]; then
  printf '%b' "$STALE_LIST" | sort -t'|' -k2 -n -r | head -20
  exit 0
fi

if [ "$JSON_OUTPUT" = "true" ] && command -v jq >/dev/null 2>&1; then
  STALE_JSON=$(printf '%b' "$STALE_LIST" | awk -F'|' 'NF>=2 { printf "{\"file\":\"%s\",\"days\":%s,\"last_verified\":\"%s\"}\n", $1, $2, $3 }' | head -20 | jq -s .)
  MISSING_JSON=$(printf '%b' "$MISSING_LV_LIST" | awk -F'|' 'NF>=2 { printf "{\"file\":\"%s\",\"days\":%s}\n", $1, $2 }' | head -20 | jq -s .)
  CONTRA_JSON=$(printf '%s' "$CONTRADICTION_LIST" | awk 'NF { gsub(/"/,"\\\""); printf "\"%s\"\n", $0 }' | jq -s .)

  jq -n \
    --arg mem_dir "$MEM_DIR" \
    --argjson total "$TOTAL" \
    --argjson with_lv "$WITH_LV" \
    --argjson without_lv "$WITHOUT_LV" \
    --argjson stale "$STALE" \
    --argjson ttl_days "$TTL_DAYS" \
    --argjson count_feedback "$COUNT_FEEDBACK" \
    --argjson count_project "$COUNT_PROJECT" \
    --argjson count_user "$COUNT_USER" \
    --argjson count_reference "$COUNT_REFERENCE" \
    --argjson count_other "$COUNT_OTHER" \
    --argjson contradiction_count "$CONTRADICTION_COUNT" \
    --argjson stale_top "${STALE_JSON:-[]}" \
    --argjson missing_top "${MISSING_JSON:-[]}" \
    --argjson contradictions "${CONTRA_JSON:-[]}" \
    '{
      mem_dir: $mem_dir,
      total: $total,
      ttl_days: $ttl_days,
      last_verified: { with: $with_lv, without: $without_lv },
      stale: $stale,
      by_type: {
        feedback: $count_feedback,
        project: $count_project,
        user: $count_user,
        reference: $count_reference,
        other: $count_other
      },
      contradictions: { count: $contradiction_count, groups: $contradictions },
      top_stale: $stale_top,
      top_missing_lv: $missing_top
    }'
  exit 0
fi

cat <<EOF
═══════════════════════════════════════════════════
  Memory Layer Audit
  $(date "+%Y-%m-%d %H:%M")  ·  TTL: ${TTL_DAYS} days
═══════════════════════════════════════════════════

📁 Path: $MEM_DIR

📊 Counts
  Всего записей:           $TOTAL
  С last_verified:         $WITH_LV
  Без last_verified:       $WITHOUT_LV  (fallback to mtime)
  Старше ${TTL_DAYS}d:     $STALE

  По типу:
    feedback:    $COUNT_FEEDBACK
    project:     $COUNT_PROJECT
    user:        $COUNT_USER
    reference:   $COUNT_REFERENCE
    other:       $COUNT_OTHER

EOF

if [ "$STALE" -gt 0 ]; then
  echo "⚠  Top stale (>${TTL_DAYS} days):"
  printf '%b' "$STALE_LIST" | sort -t'|' -k2 -n -r | head -10 | awk -F'|' '{ printf "    %3d дн  ·  %s  (last_verified: %s)\n", $2, $1, $3 }'
  echo
fi

if [ "$WITHOUT_LV" -gt 0 ]; then
  echo "🔧 Без last_verified (run: bash scripts/memory-backfill.sh):"
  printf '%b' "$MISSING_LV_LIST" | sort -t'|' -k2 -n -r | head -5 | awk -F'|' '{ printf "    %3d дн mtime  ·  %s\n", $2, $1 }'
  [ "$WITHOUT_LV" -gt 5 ] && echo "    ... и ещё $(( WITHOUT_LV - 5 ))"
  echo
fi

if [ "$CONTRADICTION_COUNT" -gt 0 ]; then
  echo "🔀 Suspected contradictions / overlap (review queue):"
  echo "$CONTRADICTION_LIST" | head -10 | sed 's/^/    /'
  echo
fi

cat <<EOF
═══════════════════════════════════════════════════
Hint: --json for machine output · --stale-only for top stale list
EOF
