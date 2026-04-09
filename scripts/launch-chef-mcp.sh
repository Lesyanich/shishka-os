#!/bin/bash
export SUPABASE_SERVICE_ROLE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w)
export SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
exec node "$(dirname "$0")/../services/mcp-chef/dist/index.js"
