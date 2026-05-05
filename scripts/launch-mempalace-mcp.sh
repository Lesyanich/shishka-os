#!/usr/bin/env bash
# launch-mempalace-mcp.sh — starts the shishka-mempalace MCP server.
# Referenced by .mcp.json and (after setup) by Claude Desktop's config.
# Worktree-aware: resolves the venv against the main checkout, where
# .venv/ actually lives — gitignored, so absent in worktrees.
set -uo pipefail

# chromadb (transitive dep of mempalace) ships anonymized PostHog telemetry;
# mempalace README mandates disabling it in every shell that touches the palace.
export ANONYMIZED_TELEMETRY=False

# Resolve main worktree root via $(git rev-parse --git-common-dir).
# The common-dir is the shared .git/; the main worktree is its parent.
GIT_COMMON_DIR="$(git -C "$(dirname "$0")" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON_DIR" ]; then
  # Not inside a git repo — assume script lives in the main checkout.
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
else
  # Make GIT_COMMON_DIR absolute if git returned a relative path.
  if [ "${GIT_COMMON_DIR#/}" = "$GIT_COMMON_DIR" ]; then
    GIT_COMMON_DIR="$(cd "$(dirname "$0")" && cd "$GIT_COMMON_DIR" && pwd -P)"
  fi
  REPO_ROOT="$(dirname "$GIT_COMMON_DIR")"
fi

VENV_PY="$REPO_ROOT/services/mempalace/.venv/bin/python"

# Retry once after 2s — Google Drive sync may delay file visibility on cold start.
if [[ ! -x "$VENV_PY" ]]; then
  sleep 2
  if [[ ! -x "$VENV_PY" ]]; then
    echo "ERROR: mempalace venv not found at $VENV_PY" >&2
    echo "Run: cd $REPO_ROOT/services/mempalace && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    exit 1
  fi
fi

exec "$VENV_PY" -m mempalace.mcp_server
