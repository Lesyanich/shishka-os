#!/usr/bin/env bash
#
# cleanup-drive-bloat.sh
#
# One-time cleanup of files that should never have been synced to Google Drive.
# Removes node_modules, Python virtual envs, build artifacts, and stale Claude
# Code worktrees. Everything removed here is regeneratable (npm install,
# python -m venv, npm run build) or already preserved in .git/ (worktree
# branches survive — only the filesystem copy is removed).
#
# Usage:
#   ./scripts/cleanup-drive-bloat.sh           # dry-run: shows what would be deleted
#   ./scripts/cleanup-drive-bloat.sh --execute # actually delete
#
# Run from project root. Safe to re-run.

set -euo pipefail

# ---- Locate project root --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

EXECUTE=0
if [[ "${1:-}" == "--execute" ]]; then
  EXECUTE=1
fi

# ---- Pretty output --------------------------------------------------------
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n" "$*"; }

# ---- Confirm we're in the right place -------------------------------------
if [[ ! -f "CLAUDE.md" || ! -d ".git" ]]; then
  red "ERROR: doesn't look like the Shishka project root: $ROOT"
  exit 1
fi

bold "Cleaning Google Drive bloat in: $ROOT"
echo

if [[ $EXECUTE -eq 0 ]]; then
  dim "[DRY RUN] Pass --execute to actually delete."
else
  red "[EXECUTE MODE] Files will be deleted."
fi
echo

# ---- Targets --------------------------------------------------------------
# Each entry is a path pattern relative to project root.
# Globs are expanded with `find` so paths with spaces work safely.
TARGETS=(
  # JS dependencies (npm install regenerates)
  "node_modules"
  "apps/admin-panel/node_modules"
  "apps/kds/node_modules"
  "services/mcp-mission-control/node_modules"
  "services/mcp-finance/node_modules"
  "services/mcp-chef/node_modules"
  "services/mcp-graphify/node_modules"
  "tools/gdrive-sync/node_modules"

  # Python virtual envs (python -m venv regenerates)
  "venv"
  "services/mempalace/.venv"
  "services/brain/.venv"
  "services/graphify/.venv"

  # Build output (npm run build regenerates)
  "apps/admin-panel/dist"
  "apps/admin-panel/.vite"
  "apps/kds/dist"
  "services/mcp-chef/dist"
  "services/mcp-finance/dist"
  "services/mcp-mission-control/dist"
  "services/mcp-graphify/dist"
)

# Also catch any other build/cache artifacts we forgot, scoped to known dirs.
DYNAMIC_TARGETS=()
for d in apps services tools; do
  if [[ -d "$d" ]]; then
    while IFS= read -r -d '' p; do
      DYNAMIC_TARGETS+=("$p")
    done < <(find "$d" -maxdepth 4 -type d \
              \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".mypy_cache" \
                 -o -name ".ruff_cache" -o -name ".turbo" -o -name ".next" \
                 -o -name "coverage" -o -name ".nyc_output" \) \
              -print0 2>/dev/null)
  fi
done

# Stale Claude Code worktrees — branches survive in .git/refs/heads/
WORKTREES=()
if [[ -d ".claude/worktrees" ]]; then
  while IFS= read -r -d '' w; do
    WORKTREES+=("$w")
  done < <(find .claude/worktrees -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
fi

# ---- Plan summary ---------------------------------------------------------
total_items=0
plan_lines=()

count_items() {
  local p="$1"
  if [[ -e "$p" ]]; then
    find "$p" 2>/dev/null | wc -l | tr -d ' '
  else
    echo "0"
  fi
}

bold "Plan:"
for t in "${TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    c=$(count_items "$t")
    total_items=$((total_items + c))
    printf "  %8d items  %s\n" "$c" "$t"
  fi
done

if [[ ${#DYNAMIC_TARGETS[@]} -gt 0 ]]; then
  echo
  bold "Cache/build artifacts found:"
  for t in "${DYNAMIC_TARGETS[@]}"; do
    c=$(count_items "$t")
    total_items=$((total_items + c))
    printf "  %8d items  %s\n" "$c" "$t"
  done
fi

if [[ ${#WORKTREES[@]} -gt 0 ]]; then
  echo
  bold "Stale Claude Code worktrees (branches preserved in .git/):"
  for w in "${WORKTREES[@]}"; do
    c=$(count_items "$w")
    total_items=$((total_items + c))
    printf "  %8d items  %s\n" "$c" "$w"
  done
fi

echo
green "TOTAL TO REMOVE: $total_items items"
echo

# ---- Safety check before delete -------------------------------------------
if [[ $EXECUTE -eq 0 ]]; then
  echo
  dim "Dry-run complete. To actually delete, run:"
  dim "    ./scripts/cleanup-drive-bloat.sh --execute"
  exit 0
fi

# Final confirmation (skip with CLEANUP_YES=1 env var)
if [[ "${CLEANUP_YES:-0}" != "1" ]]; then
  read -r -p "Proceed with deletion of $total_items items? [y/N] " ans
  if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    red "Aborted."
    exit 1
  fi
fi

# ---- Execute --------------------------------------------------------------
delete_one() {
  local p="$1"
  if [[ -e "$p" ]]; then
    rm -rf "$p"
    echo "  removed: $p"
  fi
}

bold "Deleting build/dep artifacts..."
for t in "${TARGETS[@]}";        do delete_one "$t"; done
for t in "${DYNAMIC_TARGETS[@]}"; do delete_one "$t"; done

if [[ ${#WORKTREES[@]} -gt 0 ]]; then
  echo
  bold "Deleting stale worktrees..."
  for w in "${WORKTREES[@]}"; do delete_one "$w"; done

  echo
  bold "Pruning .git/worktrees/ metadata..."
  git worktree prune --verbose || true
fi

echo
green "Done. Final item count under project root:"
find . 2>/dev/null | wc -l

echo
dim "Next steps:"
dim "  1. Drive will sync deletions in the background — give it ~10–30 min."
dim "  2. Empty Google Drive Trash to free the item slots:"
dim "       https://drive.google.com/drive/trash"
dim "  3. To restore deps later:"
dim "       - JS apps:      npm install   (per app)"
dim "       - Python svcs:  python -m venv .venv && pip install -e .   (per service)"
dim "  4. IMPORTANT: rebuild MCP servers, otherwise Claude will fail with MODULE_NOT_FOUND:"
dim "       cd services/mcp-chef && npm install && npm run build"
dim "       cd services/mcp-finance && npm install && npm run build"
dim "       cd services/mcp-mission-control && npm install && npm run build"
dim "       (launch-*-mcp.sh scripts exec node dist/index.js — without dist/ all MCPs break)"
