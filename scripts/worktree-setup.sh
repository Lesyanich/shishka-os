#!/bin/sh
# ============================================================
# Shishka OS — Worktree auto-link
# When Claude Code spawns a git worktree, node_modules and
# .env.local don't follow (they're untracked / gitignored). This
# script symlinks them from the main checkout so `npm run dev`
# and preview tools work immediately.
#
# Idempotent. Safe to run on every session start. No-op in main.
# ============================================================

set -e

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo "")
GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null || echo "")

# Skip if not in a worktree (main checkout has equal git-dir / git-common-dir).
if [ -z "$GIT_DIR" ] || [ "$GIT_DIR" = "$GIT_COMMON" ]; then
  exit 0
fi

# Main checkout = parent dir of common .git/. dirname is whitespace-safe;
# `awk` on `git worktree list --porcelain` breaks if the path has spaces.
MAIN=$(CDPATH= cd -- "$(dirname -- "$GIT_COMMON")" 2>/dev/null && pwd)
WORKTREE=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

if [ -z "$MAIN" ] || [ ! -d "$MAIN" ] || [ "$MAIN" = "$WORKTREE" ]; then
  exit 0
fi

link_if_missing() {
  rel="$1"
  src="$MAIN/$rel"
  dst="$WORKTREE/$rel"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    return 0
  fi
  if [ ! -e "$src" ]; then
    return 0
  fi
  mkdir -p "$(dirname "$dst")" 2>/dev/null || true
  ln -s "$src" "$dst" 2>/dev/null || true
}

# Targets: node_modules and .env.local for each app + repo root.
link_if_missing "apps/admin-panel/node_modules"
link_if_missing "apps/admin-panel/.env.local"
link_if_missing "apps/kds/node_modules"
link_if_missing "apps/kds/.env.local"
link_if_missing "node_modules"
