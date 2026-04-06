#!/bin/sh

# ============================================================
# generate-status.sh — HC-1 Reactive Status Generator
# Called by .husky/post-commit after every commit.
# Runs generate_status tool from mcp-mission-control as standalone script.
# ============================================================

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "[generate-status] ERROR: not in a git repo"
  exit 1
fi

MC_DIR="$REPO_ROOT/services/mcp-mission-control"

# Check if .env has required vars, or if they're already in environment
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  # Try loading from .env at repo root
  if [ -f "$REPO_ROOT/.env" ]; then
    export $(grep -v '^#' "$REPO_ROOT/.env" | xargs)
  fi
fi

# Verify required env vars
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "[generate-status] SKIP: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. STATUS.md not updated."
  exit 0
fi

# Run the generate-status script via tsx (fast ts runner)
if command -v npx >/dev/null 2>&1; then
  cd "$MC_DIR" && npx tsx "$REPO_ROOT/scripts/run-generate-status.ts" "$REPO_ROOT" 2>/dev/null &
  echo "[generate-status] Started async STATUS.md generation"
else
  echo "[generate-status] SKIP: npx not available"
fi
