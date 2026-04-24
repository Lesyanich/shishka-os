#!/bin/bash
# launch-mempalace-mcp.sh — starts the shishka-mempalace MCP server.
# Referenced by .mcp.json and (after setup) by Claude Desktop's config.
# Safe to invoke by absolute path — resolves venv relative to this script.
set -uo pipefail

# chromadb (transitive dep of mempalace) ships anonymized PostHog telemetry;
# mempalace README mandates disabling it in every shell that touches the palace.
export ANONYMIZED_TELEMETRY=False

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
VENV_PY="$SCRIPT_DIR/../services/mempalace/.venv/bin/python"

# Retry once after 2s — Google Drive sync may delay file visibility on cold start.
if [[ ! -x "$VENV_PY" ]]; then
  sleep 2
  if [[ ! -x "$VENV_PY" ]]; then
    echo "ERROR: mempalace venv not found at $VENV_PY" >&2
    echo "Run: cd services/mempalace && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    exit 1
  fi
fi

exec "$VENV_PY" -m mempalace.mcp_server
