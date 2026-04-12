#!/bin/bash
# Brain Quality Nightly — runs judge, gap monitor, regression sequentially.
#
# Spec: docs/plans/spec-brain-feedback-loop.md
# MC task: 087e6502
#
# Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
# Optional: LIGHTRAG_URL (default http://localhost:9621), MEMPALACE_URL (default http://localhost:8765)
#
# Usage: ./services/brain/run-nightly.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_PREFIX="[brain-quality]"

echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') — Starting nightly brain quality run"

# Load secrets from macOS Keychain (production path)
# Falls back to .env file if keychain entries are missing
_kc() { security find-generic-password -s "$1" -w 2>/dev/null || security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null || true; }

export SUPABASE_URL="${SUPABASE_URL:-$(_kc shishka-supabase-url)}"
[ -z "$SUPABASE_URL" ] && export SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"

export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(_kc SUPABASE_SERVICE_ROLE_KEY)}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-$(_kc shishka-openAI-api-key)}"

# Fallback: load .env if present and vars still missing
ENV_FILE="$SCRIPT_DIR/../../.env"
if [ -f "$ENV_FILE" ] && [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Activate venv if present
VENV="$SCRIPT_DIR/.venv/bin/python3"
PYTHON="${VENV:-python3}"
if [ -f "$VENV" ]; then
  PYTHON="$VENV"
else
  PYTHON="python3"
fi

# Fix macOS Python 3.14 SSL: use certifi certs if system certs are missing
if [ -z "${SSL_CERT_FILE:-}" ]; then
  CERT_PATH=$("$PYTHON" -c "import certifi; print(certifi.where())" 2>/dev/null || true)
  if [ -n "$CERT_PATH" ]; then
    export SSL_CERT_FILE="$CERT_PATH"
  fi
fi

echo "$LOG_PREFIX Step 1/3: LLM Judge"
"$PYTHON" "$SCRIPT_DIR/judge.py" || echo "$LOG_PREFIX WARNING: judge.py failed"

echo ""
echo "$LOG_PREFIX Step 2/3: Gap Monitor"
"$PYTHON" "$SCRIPT_DIR/gap_monitor.py" || echo "$LOG_PREFIX WARNING: gap_monitor.py failed"

echo ""
echo "$LOG_PREFIX Step 3/3: Regression Tests"
"$PYTHON" "$SCRIPT_DIR/regression.py" || echo "$LOG_PREFIX WARNING: regression.py failed"

echo ""
echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') — Nightly run complete"
