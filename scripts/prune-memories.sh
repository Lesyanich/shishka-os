#!/usr/bin/env bash
# prune-memories.sh — Remove stale project memory files older than TTL
# Phase D4: AI-Native Operations Modernization
#
# Usage: ./scripts/prune-memories.sh [--dry-run] [--ttl DAYS]
# Default TTL: 30 days
#
# Scans .claude/projects/*/memory/ for .md files (excluding MEMORY.md index)
# that haven't been modified within TTL days. Removes them and cleans up
# their entries from MEMORY.md.

set -euo pipefail

TTL=30
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
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

for memory_dir in "$MEMORY_BASE"/*/memory; do
  [ -d "$memory_dir" ] || continue

  index_file="$memory_dir/MEMORY.md"
  project_name=$(basename "$(dirname "$memory_dir")")

  for file in "$memory_dir"/*.md; do
    [ -f "$file" ] || continue
    basename_file=$(basename "$file")

    # Never prune the index
    [ "$basename_file" = "MEMORY.md" ] && continue

    # Check modification time
    if [ "$(uname)" = "Darwin" ]; then
      mod_days=$(( ( $(date +%s) - $(stat -f %m "$file") ) / 86400 ))
    else
      mod_days=$(( ( $(date +%s) - $(stat -c %Y "$file") ) / 86400 ))
    fi

    if [ "$mod_days" -gt "$TTL" ]; then
      if [ "$DRY_RUN" = true ]; then
        echo "[dry-run] Would prune: $basename_file ($mod_days days old) in $project_name"
      else
        rm "$file"
        # Remove entry from MEMORY.md index
        if [ -f "$index_file" ]; then
          sed -i'' -e "/$basename_file/d" "$index_file"
        fi
        echo "[pruned] $basename_file ($mod_days days old) in $project_name"
      fi
      PRUNED=$((PRUNED + 1))
    else
      KEPT=$((KEPT + 1))
    fi
  done
done

echo "[prune] Done. Pruned: $PRUNED, Kept: $KEPT (TTL: ${TTL}d)"
