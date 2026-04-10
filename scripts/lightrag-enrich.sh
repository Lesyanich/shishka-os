#!/usr/bin/env bash
#
# LightRAG enrichment — batch-ingest docs/constitution, docs/plans/spec-*,
# and docs/operations into the running LightRAG server.
#
# MC task: a43361ce  (Brain: LightRAG enrichment)
# Follows the same POST /documents/text pattern as deploy.md re-ingest.
#
# Usage:
#   ./scripts/lightrag-enrich.sh                          # default URL
#   ./scripts/lightrag-enrich.sh http://localhost:9621     # local dev
#   ./scripts/lightrag-enrich.sh http://34.42.151.172:9621 # GCP prod
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_URL="${1:-http://34.42.151.172:9621}"

# ── Exclusions ──
# p0-rules.md: legacy, replaced by core-rules.md (would create stale edges)
# spec-lightrag.md: self-referential meta-spec about LightRAG itself
EXCLUDE_FILES=(
  "docs/constitution/p0-rules.md"
  "docs/plans/spec-lightrag.md"
)

is_excluded() {
  local rel="$1"
  for excl in "${EXCLUDE_FILES[@]}"; do
    [[ "$rel" == "$excl" ]] && return 0
  done
  return 1
}

# ── Pre-flight ──
echo "=== LightRAG Enrichment ==="
echo "Server:  $SERVER_URL"
echo "Repo:    $REPO_ROOT"
echo ""

echo -n "Health check... "
HEALTH=$(curl -s --connect-timeout 5 "$SERVER_URL/health" 2>&1) || {
  echo "FAIL"
  echo "Server unreachable at $SERVER_URL"
  echo "Start the VM: gcloud compute instances start shishka-production --zone=us-central1-a --project=shishka-automation-hubs"
  exit 1
}
echo "OK"

echo -n "Current docs... "
DOC_STATUS=$(curl -s "$SERVER_URL/documents/status" 2>&1)
echo "$DOC_STATUS"
echo ""

# ── Collect files ──
FILES=()

# 1. docs/constitution/*.md
for f in "$REPO_ROOT"/docs/constitution/*.md; do
  [[ -f "$f" ]] || continue
  rel="${f#$REPO_ROOT/}"
  is_excluded "$rel" && continue
  FILES+=("$f")
done

# 2. docs/plans/spec-*.md
for f in "$REPO_ROOT"/docs/plans/spec-*.md; do
  [[ -f "$f" ]] || continue
  rel="${f#$REPO_ROOT/}"
  is_excluded "$rel" && continue
  FILES+=("$f")
done

# 3. docs/operations/*.md
for f in "$REPO_ROOT"/docs/operations/*.md; do
  [[ -f "$f" ]] || continue
  rel="${f#$REPO_ROOT/}"
  is_excluded "$rel" && continue
  FILES+=("$f")
done

TOTAL=${#FILES[@]}
echo "Files to ingest: $TOTAL"
echo ""

if [[ $TOTAL -eq 0 ]]; then
  echo "Nothing to ingest."
  exit 0
fi

# ── Ingest loop ──
OK=0
FAIL=0
FAIL_LIST=()

for i in "${!FILES[@]}"; do
  f="${FILES[$i]}"
  rel="${f#$REPO_ROOT/}"
  n=$((i + 1))

  printf "[%2d/%d] %-60s " "$n" "$TOTAL" "$rel"

  # Read file content, JSON-escape it via Python
  JSON_BODY=$(python3 -c "
import json, sys
content = open(sys.argv[1]).read()
print(json.dumps({'text': content}))
" "$f" 2>&1) || {
    echo "SKIP (read error)"
    FAIL=$((FAIL + 1))
    FAIL_LIST+=("$rel (read error)")
    continue
  }

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 10 \
    --max-time 120 \
    -X POST "$SERVER_URL/documents/text" \
    -H "Content-Type: application/json" \
    -d "$JSON_BODY" 2>&1) || HTTP_CODE="000"

  if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" || "$HTTP_CODE" == "202" ]]; then
    echo "OK ($HTTP_CODE)"
    OK=$((OK + 1))
  else
    echo "FAIL ($HTTP_CODE)"
    FAIL=$((FAIL + 1))
    FAIL_LIST+=("$rel (HTTP $HTTP_CODE)")
  fi

  # Rate-limit: let extraction pipeline breathe
  [[ $n -lt $TOTAL ]] && sleep 3
done

# ── Summary ──
echo ""
echo "=== Summary ==="
echo "Total:   $TOTAL"
echo "Success: $OK"
echo "Failed:  $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Failed files:"
  for item in "${FAIL_LIST[@]}"; do
    echo "  - $item"
  done
fi

echo ""
echo -n "Post-ingest doc status... "
curl -s "$SERVER_URL/documents/status" 2>&1
echo ""
