#!/bin/bash
# Self-locating launcher for the shishka-graphify MCP server.
# GRAPHIFY_ROOT = repo root (holds apps/admin-panel/public/graph.json).
# Path is derived from this script's own location, so it works regardless of
# which user cloned the repo or where — no hardcoded /Users/<name>/ path.
export GRAPHIFY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$(dirname "$0")/../services/mcp-graphify/dist/index.js"
