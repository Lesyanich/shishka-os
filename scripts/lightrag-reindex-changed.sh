#!/usr/bin/env bash
#
# LightRAG incremental reindex — accepts changed file paths from stdin,
# filters to docs/bible/*.md and docs/domain/*.md, and POSTs each to
# the LightRAG /documents/text endpoint.
#
# Called by .husky/post-commit when bible/domain files change.
# Runs async (backgrounded) — must never block the commit flow.
#
# MC task: c2778157 (Brain: auto-ingest pipeline)
# Pattern: reuses curl + python3 JSON-escape from lightrag-enrich.sh
#
# Usage:
#   echo "docs/bible/kitchen-philosophy.md" | bash scripts/lightrag-reindex-changed.sh
#   git diff-tree --no-commit-id --name-only -r HEAD | bash scripts/lightrag-reindex-changed.sh
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIGHTRAG_URL="${LIGHTRAG_URL:-http://localhost:9621}"
RATE_LIMIT_SECONDS=3

echo "[lightrag-reindex] Starting incremental reindex"
echo "[lightrag-reindex] Server: $LIGHTRAG_URL"

# ── Collect matching files from stdin ──
FILES=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # Only process docs/bible/*.md and docs/domain/*.md
  if [[ "$line" =~ ^docs/(bible|domain)/.*\.md$ ]]; then
    FULL_PATH="$REPO_ROOT/$line"
    if [[ -f "$FULL_PATH" ]]; then
      FILES+=("$line")
    else
      echo "[lightrag-reindex] SKIP $line (file not found — possibly deleted)"
    fi
  fi
done

TOTAL=${#FILES[@]}
if [[ $TOTAL -eq 0 ]]; then
  echo "[lightrag-reindex] No bible/domain files to reindex"
  exit 0
fi

echo "[lightrag-reindex] Files to reindex: $TOTAL"

# ── Health check (non-blocking: warn and exit 0 if server is down) ──
if ! curl -s --connect-timeout 5 "$LIGHTRAG_URL/health" >/dev/null 2>&1; then
  echo "[lightrag-reindex] WARN: server unreachable at $LIGHTRAG_URL — skipping reindex"
  exit 0
fi

# ── Ingest loop ──
OK=0
FAIL=0

for i in "${!FILES[@]}"; do
  rel="${FILES[$i]}"
  FULL_PATH="$REPO_ROOT/$rel"
  n=$((i + 1))

  printf "[lightrag-reindex] [%d/%d] %s ... " "$n" "$TOTAL" "$rel"

  # JSON-encode file content via python3 (same pattern as lightrag-enrich.sh)
  JSON_BODY=$(python3 -c "
import json, sys
content = open(sys.argv[1]).read()
print(json.dumps({'text': content}))
" "$FULL_PATH" 2>&1) || {
    echo "SKIP (read error)"
    FAIL=$((FAIL + 1))
    continue
  }

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 10 \
    --max-time 120 \
    -X POST "$LIGHTRAG_URL/documents/text" \
    -H "Content-Type: application/json" \
    -d "$JSON_BODY" 2>&1) || HTTP_CODE="000"

  if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" || "$HTTP_CODE" == "202" ]]; then
    echo "OK ($HTTP_CODE)"
    OK=$((OK + 1))
  else
    echo "FAIL ($HTTP_CODE)"
    FAIL=$((FAIL + 1))
  fi

  # Rate-limit between POSTs
  [[ $n -lt $TOTAL ]] && sleep "$RATE_LIMIT_SECONDS"
done

echo "[lightrag-reindex] Done: $OK/$TOTAL succeeded, $FAIL failed"
