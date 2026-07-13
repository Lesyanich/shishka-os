#!/bin/bash
# Self-locating launcher for the shishka-graphify MCP server.
# GRAPHIFY_ROOT = repo root (holds apps/admin-panel/public/graph.json).
# Path is derived from this script's own location, so it works regardless of
# which user cloned the repo or where — no hardcoded /Users/<name>/ path.
DIR="$(dirname "$0")"
# Auto-rebuild dist/ from src/ if sources changed (build output -> stderr only).
"$DIR/mcp-build-if-stale.sh" "$DIR/../services/mcp-graphify" >&2
export GRAPHIFY_ROOT="$(cd "$DIR/.." && pwd)"
exec node "$DIR/../services/mcp-graphify/dist/index.js"
