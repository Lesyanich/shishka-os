#!/bin/bash
# Rebuild an MCP service's dist/ from src/ ONLY if sources changed since the
# last build. ALL output goes to stderr — a stdio MCP server's stdout is the
# JSON-RPC channel and must stay clean. Never fails the launch: on any build
# problem it falls back to the existing dist/ so the server still starts.
# Usage: mcp-build-if-stale.sh <service-dir>

exec 1>&2   # redirect this script's (and children's) stdout to stderr

SVC="$1"
SRC="$SVC/src"
DIST="$SVC/dist/index.js"

if [ ! -f "$DIST" ] || [ -n "$(find "$SRC" -type f -newer "$DIST" 2>/dev/null | head -1)" ]; then
  echo "[mcp-build] $(basename "$SVC"): sources changed -> rebuilding..."
  if [ ! -d "$SVC/node_modules" ]; then
    ( cd "$SVC" && npm install ) || { echo "[mcp-build] npm install failed - using existing dist"; exit 0; }
  fi
  if ( cd "$SVC" && npm run build ); then
    echo "[mcp-build] $(basename "$SVC"): rebuilt OK"
  else
    echo "[mcp-build] $(basename "$SVC"): build FAILED - using existing dist"
  fi
fi
exit 0
