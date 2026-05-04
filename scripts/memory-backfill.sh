#!/bin/sh
# ============================================================
# Shishka OS — Memory Layer Backfill (WS-2)
#
# One-shot bootstrap: add `last_verified: YYYY-MM-DD` to memory
# files in the agent auto-memory dir that don't have it.
#
# - Date inserted = file's mtime as YYYY-MM-DD (honest "last touched")
# - Idempotent: files with last_verified already present are skipped
# - Inserts the line right after the existing `type:` line
#
# Usage:
#   bash scripts/memory-backfill.sh              — apply (default)
#   bash scripts/memory-backfill.sh --dry-run    — show what would change
#
# Spec: WS-2 of Shishka OS Brain Reorganization (MC: 70ede096)
# ============================================================

set -e

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

# ----------------------------------------------------------------
MEM_DIR=""
for d in "$HOME"/.claude/projects/*hishka*/memory "$HOME"/.claude/projects/*Shishka*/memory; do
  [ -d "$d" ] || continue
  MEM_DIR="$d"
  break
done
[ -z "$MEM_DIR" ] && { echo "Memory dir not found"; exit 1; }

# ----------------------------------------------------------------
mtime_date() {
  if [ "$(uname)" = "Darwin" ]; then
    stat -f "%Sm" -t "%Y-%m-%d" "$1" 2>/dev/null
  else
    date -r "$1" "+%Y-%m-%d" 2>/dev/null
  fi
}

has_last_verified() {
  awk '
    /^---$/ { c++; if (c==2) exit }
    c==1 && /^last_verified:/ { found=1; exit }
    END { exit !found }
  ' "$1"
}

# ----------------------------------------------------------------
TOTAL=0
UPDATED=0
SKIPPED=0

for f in "$MEM_DIR"/*.md; do
  [ -f "$f" ] || continue
  bn=$(basename "$f")
  [ "$bn" = "MEMORY.md" ] && continue

  TOTAL=$(( TOTAL + 1 ))

  if has_last_verified "$f"; then
    SKIPPED=$(( SKIPPED + 1 ))
    continue
  fi

  date_str=$(mtime_date "$f")
  [ -z "$date_str" ] && { echo "WARN: cannot read mtime for $bn — skipping"; SKIPPED=$(( SKIPPED + 1 )); continue; }

  if [ "$DRY_RUN" = "true" ]; then
    echo "[dry-run] $bn ← last_verified: $date_str"
    UPDATED=$(( UPDATED + 1 ))
    continue
  fi

  # Insert `last_verified: <date>` after the `type:` line within the
  # frontmatter. Use awk for portable, atomic edit via temp file.
  tmp=$(mktemp)
  awk -v lv="last_verified: $date_str" '
    BEGIN { c=0; inserted=0 }
    /^---$/ { c++; print; next }
    c==1 && /^type:/ && !inserted {
      print
      print lv
      inserted=1
      next
    }
    # Safety: if frontmatter has no `type:`, insert before closing ---
    c==1 && /^---$/ && !inserted {
      print lv
      inserted=1
    }
    { print }
  ' "$f" > "$tmp"

  # Verify insertion succeeded; preserve original on awk failure
  if grep -q "^last_verified:" "$tmp"; then
    mv "$tmp" "$f"
    echo "[backfill] $bn ← last_verified: $date_str"
    UPDATED=$(( UPDATED + 1 ))
  else
    rm -f "$tmp"
    echo "WARN: insertion failed for $bn — file unchanged"
    SKIPPED=$(( SKIPPED + 1 ))
  fi
done

echo
if [ "$DRY_RUN" = "true" ]; then
  echo "[dry-run] Would update: $UPDATED · Already had last_verified: $SKIPPED · Total: $TOTAL"
else
  echo "[backfill] Updated: $UPDATED · Skipped (already had it): $SKIPPED · Total: $TOTAL"
fi
