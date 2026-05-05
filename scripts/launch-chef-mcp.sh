#!/usr/bin/env bash
# launch-chef-mcp.sh — starts the shishka-chef MCP server.
# Worktree-aware: resolves service paths against the main checkout, where
# build artifacts (dist/) actually live — gitignored, so absent in worktrees.
set -euo pipefail

# Resolve main worktree root via $(git rev-parse --git-common-dir).
# The common-dir is the shared .git/; the main worktree is its parent.
GIT_COMMON_DIR="$(git -C "$(dirname "$0")" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON_DIR" ]; then
  # Not inside a git repo — assume script lives in the main checkout.
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
else
  # Make GIT_COMMON_DIR absolute if git returned a relative path.
  if [ "${GIT_COMMON_DIR#/}" = "$GIT_COMMON_DIR" ]; then
    GIT_COMMON_DIR="$(cd "$(dirname "$0")" && cd "$GIT_COMMON_DIR" && pwd)"
  fi
  REPO_ROOT="$(dirname "$GIT_COMMON_DIR")"
fi

ENTRY="$REPO_ROOT/services/mcp-chef/dist/index.js"
if [ ! -f "$ENTRY" ]; then
  echo "[launcher] ERROR: $ENTRY not found. Build the service:" >&2
  echo "  cd $REPO_ROOT/services/mcp-chef && npm install && npm run build" >&2
  exit 1
fi

export SUPABASE_SERVICE_ROLE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w)
export SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
exec node "$ENTRY"
