#!/usr/bin/env bash
#
# LightRAG server launcher (Phase 1, local venv).
#
# Sources DATABASE_URL from apps/admin-panel/.env (existing secret store, never
# duplicated), parses it into POSTGRES_* env vars that lightrag-hku expects, and
# launches lightrag-server with Ollama bindings (gemma4:e2b + bge-m3).
#
# Secret never enters Claude Code context — it only lives inside the spawned
# subshell of this script.
#
# Usage:
#   services/lightrag/run-server.sh                # foreground
#   services/lightrag/run-server.sh --port 9621    # override args
#
# Workspace isolation: all tables are PUBLIC.LIGHTRAG_* with workspace='lightrag'
# row discriminator. lightrag-hku hardcodes the public schema (postgres_impl.py
# line ~1608) so a dedicated `lightrag` schema is not feasible without forking.
# Drop-safe boundary is preserved via the LIGHTRAG_ table prefix.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/db-url.local"
VENV_PY="$REPO_ROOT/venv/bin/python"
VENV_SERVER="$REPO_ROOT/venv/bin/lightrag-server"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: secret file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -x "$VENV_SERVER" ]]; then
  echo "ERROR: lightrag-server not installed at $VENV_SERVER" >&2
  echo "Run: $REPO_ROOT/venv/bin/pip install 'lightrag-hku[api]'" >&2
  exit 1
fi

# Extract DATABASE_URL line without sourcing the whole file (avoids leaking
# unrelated vars and avoids quoting/eval pitfalls).
DATABASE_URL_LINE="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$ENV_FILE" | tail -1 || true)"
if [[ -z "$DATABASE_URL_LINE" ]]; then
  echo "ERROR: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi

# Strip 'DATABASE_URL=' prefix and surrounding quotes
DATABASE_URL="${DATABASE_URL_LINE#*=}"
DATABASE_URL="${DATABASE_URL#\"}"
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\'}"
DATABASE_URL="${DATABASE_URL%\'}"
export DATABASE_URL

# Parse postgres URL into components via Python (robust against URL-encoded
# passwords and the dotted Supabase pooler usernames).
PARSED="$("$VENV_PY" - <<'PYEOF'
import os, sys
from urllib.parse import urlparse, unquote
url = os.environ["DATABASE_URL"]
p = urlparse(url)
if p.scheme not in ("postgres", "postgresql"):
    print(f"ERROR: unexpected scheme {p.scheme!r}", file=sys.stderr)
    sys.exit(1)
host = p.hostname or ""
port = p.port or 5432
user = unquote(p.username or "")
password = unquote(p.password or "")
database = (p.path or "/postgres").lstrip("/") or "postgres"
print(f"export POSTGRES_HOST={host!r}")
print(f"export POSTGRES_PORT={port}")
print(f"export POSTGRES_USER={user!r}")
print(f"export POSTGRES_PASSWORD={password!r}")
print(f"export POSTGRES_DATABASE={database!r}")
PYEOF
)"
eval "$PARSED"

# LightRAG workspace + storage backends
export POSTGRES_WORKSPACE="${POSTGRES_WORKSPACE:-lightrag}"

# Supabase pooler uses a private CA ("Supabase Intermediate 2021 CA"). Neither
# certifi nor the system bundle trust it, so asyncpg's default ssl=True path
# fails with "self-signed certificate in certificate chain".
#
# Fix: use verify-ca mode with the Supabase cert chain saved at
# services/lightrag/supabase-ca.pem (extracted once via
# `openssl s_client -connect ...pooler.supabase.com:5432 -starttls postgres
#  -showcerts`). verify-ca validates the chain but skips hostname check —
# sufficient for a private CA on a known pooler endpoint.
export POSTGRES_SSL_MODE="${POSTGRES_SSL_MODE:-verify-ca}"
export POSTGRES_SSL_ROOT_CERT="${POSTGRES_SSL_ROOT_CERT:-$SCRIPT_DIR/supabase-ca.pem}"

# Storage layer: PG for KV/Vector/DocStatus, NetworkX file for graph (Phase 1 OK)
export LIGHTRAG_KV_STORAGE="${LIGHTRAG_KV_STORAGE:-PGKVStorage}"
export LIGHTRAG_VECTOR_STORAGE="${LIGHTRAG_VECTOR_STORAGE:-PGVectorStorage}"
export LIGHTRAG_DOC_STATUS_STORAGE="${LIGHTRAG_DOC_STATUS_STORAGE:-PGDocStatusStorage}"
export LIGHTRAG_GRAPH_STORAGE="${LIGHTRAG_GRAPH_STORAGE:-NetworkXStorage}"

# LLM + embedding bindings (Ollama, all local)
export LLM_BINDING="${LLM_BINDING:-ollama}"
export LLM_BINDING_HOST="${LLM_BINDING_HOST:-http://localhost:11434}"
export LLM_MODEL="${LLM_MODEL:-gemma4:e2b}"
export EMBEDDING_BINDING="${EMBEDDING_BINDING:-ollama}"
export EMBEDDING_BINDING_HOST="${EMBEDDING_BINDING_HOST:-http://localhost:11434}"
export EMBEDDING_MODEL="${EMBEDDING_MODEL:-bge-m3}"
export EMBEDDING_DIM="${EMBEDDING_DIM:-1024}"

# Path 2 tuning (COO decision d532e8ff, 2026-04-08):
# - MAX_PARALLEL_INSERT=1 → sequential extraction, avoids Metal GPU command-buffer
#   contention on gemma4:e2b under concurrent load (operations.md + menu-items.md
#   crashed the llama runner at parallel=2).
# - TIMEOUT=600 → raise ollama httpx client read timeout from default ~240s to 600s,
#   fixes httpx.ReadTimeout on dense chunks (tables/lists in bible files).
export MAX_PARALLEL_INSERT="${MAX_PARALLEL_INSERT:-1}"
export TIMEOUT="${TIMEOUT:-600}"

# Working directory for graph file + logs
WORKING_DIR="$SCRIPT_DIR/rag_storage"
mkdir -p "$WORKING_DIR"

cd "$SCRIPT_DIR"
exec "$VENV_SERVER" \
  --host 127.0.0.1 \
  --port 9621 \
  --working-dir "$WORKING_DIR" \
  --workspace "$POSTGRES_WORKSPACE" \
  --llm-binding ollama \
  --embedding-binding ollama \
  "$@"
