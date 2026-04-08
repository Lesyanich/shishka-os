#!/bin/bash
# Finance Agent Runner — Ollama Edition (cost: $0/receipt)
# Replaced Claude Sonnet with local Gemma 4 via Ollama
#
# Usage:
#   ./agents/finance/run.sh                    # process next pending receipt
#   ./agents/finance/run.sh --batch            # process all pending receipts
#   ./agents/finance/run.sh --id <uuid>        # process specific inbox item
#   ./agents/finance/run.sh --claude           # fallback to Claude Sonnet (original)
#
# Prerequisites:
#   - Ollama running: ollama serve
#   - Model pulled: ollama pull gemma4:e2b
#   - Dependencies: cd agents/finance && npm install

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

# Load env from .env if present
if [ -f .env ]; then
  set -a; source .env; set +a
fi

# ── Claude fallback mode ──
if [ "$1" = "--claude" ]; then
  shift
  PROMPT="${1:-}"
  if [ -n "$PROMPT" ]; then
    claude \
      --model sonnet \
      --max-turns 15 \
      --mcp-config "$SCRIPT_DIR/.mcp.json" \
      --system-prompt-file "$SCRIPT_DIR/AGENT-FAST.md" \
      -p "$PROMPT"
  else
    claude \
      --model sonnet \
      --max-turns 15 \
      --mcp-config "$SCRIPT_DIR/.mcp.json" \
      --system-prompt-file "$SCRIPT_DIR/AGENT-FAST.md"
  fi
  exit 0
fi

# ── Default: Ollama mode ──

# Check Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "ERROR: Ollama is not running. Start it with: ollama serve"
  echo "Then pull the model: ollama pull gemma4:e2b"
  echo ""
  echo "Falling back to Claude Sonnet..."
  exec "$0" --claude "$@"
fi

# Install deps if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$SCRIPT_DIR" && npm install)
fi

# Run Ollama agent
node "$SCRIPT_DIR/ollama-agent.js" "$@"
