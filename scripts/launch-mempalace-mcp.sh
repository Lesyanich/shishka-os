#!/bin/bash
# launch-mempalace-mcp.sh — starts the shishka-mempalace MCP server.
# Referenced by .mcp.json and (after setup) by Claude Desktop's config.
# Safe to invoke by absolute path — resolves venv relative to this script.
set -uo pipefail

# chromadb (transitive dep of mempalace) ships anonymized PostHog telemetry;
# mempalace README mandates disabling it in every shell that touches the palace.
export ANONYMIZED_TELEMETRY=False

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

VENV_PY="$REPO_ROOT/services/mempalace/.venv/bin/python"

# Retry once after 2s — Google Drive sync may delay file visibility on cold start.
if [[ ! -x "$VENV_PY" ]]; then
  sleep 2
  if [[ ! -x "$VENV_PY" ]]; then
    echo "[launcher:mempalace] ERROR: mempalace venv not found at $VENV_PY" >&2
    echo "Build in main checkout: cd services/mempalace && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    exit 1
  fi
fi

exec "$VENV_PY" -m mempalace.mcp_server
