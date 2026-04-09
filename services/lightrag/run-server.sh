#!/usr/bin/env bash
#
# LightRAG server launcher — GCP VM deployment (Phase 2).
#
# Expects secrets as environment variables (injected by docker-compose via
# start.sh, which reads them from GCP Secret Manager). NO .env files, NO
# local file secrets.
#
# Provider mix (all OpenAI — lightrag-hku 1.4.13 has no anthropic binding):
#   LLM extraction:  OpenAI gpt-4o-mini
#   Embeddings:      OpenAI text-embedding-3-small (1536-dim)
# Shishka agents themselves still run on Claude — LightRAG is retrieval only.
#
# Usage (inside Docker):
#   /app/run-server.sh                  # default
#   /app/run-server.sh --port 9621      # override args
#
# Usage (local dev — secrets from env):
#   export ANTHROPIC_API_KEY=... OPENAI_API_KEY=... DATABASE_URL=...
#   ./run-server.sh
#
# Refs: MC 350a6738, spec-lightrag.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Validate required secrets ──
for VAR in OPENAI_API_KEY DATABASE_URL; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "ERROR: $VAR is not set. Use start.sh to fetch from GCP Secret Manager." >&2
    exit 1
  fi
done

# ── Parse DATABASE_URL into POSTGRES_* components ──
# Robust against URL-encoded passwords and dotted Supabase pooler usernames.
PARSED="$(python3 - <<'PYEOF'
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

# ── Workspace + storage backends ──
export POSTGRES_WORKSPACE="${POSTGRES_WORKSPACE:-lightrag}"

# Supabase pooler uses a private CA. verify-ca validates the chain but skips
# hostname check — sufficient for a known pooler endpoint.
export POSTGRES_SSL_MODE="${POSTGRES_SSL_MODE:-verify-ca}"
export POSTGRES_SSL_ROOT_CERT="${POSTGRES_SSL_ROOT_CERT:-$SCRIPT_DIR/supabase-ca.pem}"

# Storage layer: PG for KV/Vector/DocStatus, NetworkX file for graph
export LIGHTRAG_KV_STORAGE="${LIGHTRAG_KV_STORAGE:-PGKVStorage}"
export LIGHTRAG_VECTOR_STORAGE="${LIGHTRAG_VECTOR_STORAGE:-PGVectorStorage}"
export LIGHTRAG_DOC_STATUS_STORAGE="${LIGHTRAG_DOC_STATUS_STORAGE:-PGDocStatusStorage}"
export LIGHTRAG_GRAPH_STORAGE="${LIGHTRAG_GRAPH_STORAGE:-NetworkXStorage}"

# ── LLM + embedding providers ──
# LLM: OpenAI gpt-4o-mini (entity extraction + query answering inside LightRAG)
# Note: Shishka agents themselves still run on Claude — LightRAG is the retrieval
# engine, not the agent brain. Anthropic binding not available in lightrag-hku 1.4.13.
export LLM_BINDING="${LLM_BINDING:-openai}"
export LLM_MODEL="${LLM_MODEL:-gpt-4o-mini}"

# Embeddings: OpenAI text-embedding-3-small (1536-dim)
export EMBEDDING_BINDING="${EMBEDDING_BINDING:-openai}"
export EMBEDDING_MODEL="${EMBEDDING_MODEL:-text-embedding-3-small}"
export EMBEDDING_DIM="${EMBEDDING_DIM:-1536}"

# Tuning: no Ollama contention, but keep conservative for API rate limits
export MAX_PARALLEL_INSERT="${MAX_PARALLEL_INSERT:-2}"
export TIMEOUT="${TIMEOUT:-120}"

# ── Working directory for graph file + logs ──
# Docker: /var/lib/lightrag-rag-storage (mounted volume)
# Local:  ./rag_storage
if [[ -d /var/lib/lightrag-rag-storage ]]; then
  WORKING_DIR="/var/lib/lightrag-rag-storage"
else
  WORKING_DIR="$SCRIPT_DIR/rag_storage"
fi
mkdir -p "$WORKING_DIR"

cd "$SCRIPT_DIR"
exec lightrag-server \
  --host 0.0.0.0 \
  --port 9621 \
  --working-dir "$WORKING_DIR" \
  --workspace "$POSTGRES_WORKSPACE" \
  --llm-binding "$LLM_BINDING" \
  --embedding-binding "$EMBEDDING_BINDING" \
  "$@"
