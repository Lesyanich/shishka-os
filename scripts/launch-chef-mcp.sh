#!/bin/bash
DIR="$(dirname "$0")"
# Auto-rebuild dist/ from src/ if sources changed (build output -> stderr only).
"$DIR/mcp-build-if-stale.sh" "$DIR/../services/mcp-chef" >&2
export SUPABASE_SERVICE_ROLE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w)
export SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
exec node "$DIR/../services/mcp-chef/dist/index.js"
