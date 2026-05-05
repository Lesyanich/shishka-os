#!/bin/bash
# Resolve main worktree (where built artifacts live), not the calling worktree.
# git-common-dir returns the shared .git for any worktree; its parent is main.
GIT_COMMON_DIR="$(git -C "$(dirname "$0")" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON_DIR" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
else
  case "$GIT_COMMON_DIR" in
    /*) ;;
    *) GIT_COMMON_DIR="$(cd "$(dirname "$0")" && cd "$GIT_COMMON_DIR" && pwd)" ;;
  esac
  REPO_ROOT="$(dirname "$GIT_COMMON_DIR")"
fi

export SUPABASE_SERVICE_ROLE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w)
export SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"

ENTRY="$REPO_ROOT/services/mcp-finance/dist/index.js"
if [ ! -f "$ENTRY" ]; then
  echo "[launcher:finance] ERROR: $ENTRY missing. Build in main checkout: cd services/mcp-finance && npm install && npm run build" >&2
  exit 1
fi

exec node "$ENTRY"
