#!/usr/bin/env bash
#
# Fetch secrets from GCP Secret Manager (via REST API + VM metadata token)
# and start lightrag-server via docker compose.
#
# Run on the GCP VM (shishka-production). Uses metadata server for auth —
# no gcloud CLI dependency (snap gcloud has scope-cache bugs).
#
# Usage:
#   ./start.sh              # foreground (logs to stdout)
#   ./start.sh -d           # detached
#
# Refs: MC 350a6738, deploy.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="shishka-automation-hubs"

# ── Fetch access token from VM metadata server ──
echo "Fetching GCP access token from metadata server..."
TOKEN=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Failed to get access token from metadata server." >&2
  exit 1
fi

# ── Helper: read secret via Secret Manager REST API ──
read_secret() {
  local name="$1"
  curl -sf -H "Authorization: Bearer $TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$name/versions/latest:access" \
    | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['payload']['data']).decode(), end='')"
}

echo "Fetching secrets from GCP Secret Manager..."
export ANTHROPIC_API_KEY="$(read_secret lightrag-anthropic-key)"
export OPENAI_API_KEY="$(read_secret lightrag-openai-key)"
export DATABASE_URL="$(read_secret lightrag-database-url)"

for VAR in ANTHROPIC_API_KEY OPENAI_API_KEY DATABASE_URL; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "ERROR: Failed to read $VAR from Secret Manager. Check IAM permissions." >&2
    exit 1
  fi
done

echo "Secrets loaded. Starting lightrag-server..."
cd "$SCRIPT_DIR"
exec sudo -E docker compose up --build "$@"
