#!/usr/bin/env bash
# prune-memories.sh — Remove stale project memory files older than TTL
# Phase D4: AI-Native Operations Modernization
# Updated 2026-05-04 (WS-2 of 75e735e5): freshness comes from frontmatter
# `last_verified:`; mtime is the fallback when the field is missing.
#
# Usage:
#   ./scripts/prune-memories.sh                 — DRY-RUN by default (safe)
#   ./scripts/prune-memories.sh --apply         — actually delete stale files
#   ./scripts/prune-memories.sh --apply --ttl 60
# Default TTL: 60 days (was 30; aligned with WS-2 spec).
#
# Scans .claude/projects/*/memory/ for .md files (excluding MEMORY.md index).
# Freshness rule:
#   1. If frontmatter has `last_verified: YYYY-MM-DD` → use that
#   2. Otherwise → mtime fallback
# Files older than TTL are flagged. With --apply they're removed and the
# MEMORY.md entry is deleted too.

set -euo pipefail

TTL=60
APPLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --apply) APPLY=true; shift ;;
    --dry-run) APPLY=false; shift ;;  # backward compat (was default already)
    --ttl) TTL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

MEMORY_BASE="$HOME/.claude/projects"
PRUNED=0
KEPT=0

if [ ! -d "$MEMORY_BASE" ]; then
  echo "[prune] No memory base found at $MEMORY_BASE"
  exit 0
fi

# Cross-platform helpers
mtime_epoch() {
  if [ "$(uname)" = "Darwin" ]; then
    stat -f %m "$1" 2>/dev/null || echo 0
  else
    stat -c %Y "$1" 2>/dev/null || echo 0
  fi
}

date_to_epoch() {
  d="$1"
  [ -z "$d" ] && { echo 0; return; }
  if [ "$(uname)" = "Darwin" ]; then
    date -j -f "%Y-%m-%d" "$d" "+%s" 2>/dev/null || echo 0
  else
    date -d "$d" +%s 2>/dev/null || echo 0
  fi
}

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

NOW=$(date +%s)

for memory_dir in "$MEMORY_BASE"/*/memory; do
  [ -d "$memory_dir" ] || continue

  index_file="$memory_dir/MEMORY.md"
  project_name=$(basename "$(dirname "$memory_dir")")

  for file in "$memory_dir"/*.md; do
    [ -f "$file" ] || continue
    basename_file=$(basename "$file")

    # Never prune the index
    [ "$basename_file" = "MEMORY.md" ] && continue

    # Resolve freshness: frontmatter first, mtime fallback
    lv=$(parse_last_verified "$file")
    if [ -n "$lv" ]; then
      ts=$(date_to_epoch "$lv")
      source="last_verified=$lv"
    else
      ts=$(mtime_epoch "$file")
      source="mtime"
    fi

    age_days=$(( ( NOW - ts ) / 86400 ))

    if [ "$age_days" -gt "$TTL" ]; then
      if [ "$APPLY" = true ]; then
        rm "$file"
        if [ -f "$index_file" ]; then
          # Use a portable sed -i invocation
          if [ "$(uname)" = "Darwin" ]; then
            sed -i '' "/$basename_file/d" "$index_file"
          else
            sed -i "/$basename_file/d" "$index_file"
          fi
        fi
        echo "[pruned] $basename_file ($age_days days, $source) in $project_name"
      else
        echo "[dry-run] Would prune: $basename_file ($age_days days, $source) in $project_name"
      fi
      PRUNED=$((PRUNED + 1))
    else
      KEPT=$((KEPT + 1))
    fi
  done
done

if [ "$APPLY" = true ]; then
  echo "[prune] Done. Pruned: $PRUNED, Kept: $KEPT (TTL: ${TTL}d)"
else
  echo "[prune] DRY-RUN. Would prune: $PRUNED, Kept: $KEPT (TTL: ${TTL}d)"
  echo "        Run with --apply to actually delete."
fi
