#!/bin/bash
DIR="$(dirname "$0")"
# Auto-rebuild dist/ from src/ if sources changed (build output -> stderr only).
"$DIR/mcp-build-if-stale.sh" "$DIR/../services/mcp-chef" >&2
# Env var wins (remote/CI containers); macOS Keychain is the local fallback.
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && command -v security >/dev/null 2>&1; then
  export SUPABASE_SERVICE_ROLE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w)
fi
export SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
exec node "$DIR/../services/mcp-chef/dist/index.js"
