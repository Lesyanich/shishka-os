#!/usr/bin/env bash
#
# MemPalace incremental session-log ingest.
#
# Detects which agents/*/session-log.md files changed in HEAD commit,
# extracts new sections (since last ingest marker), runs them through
# filter.py, and ingests via `mempalace mine`.
#
# Called by .husky/post-commit when session-log files change.
# Runs async (backgrounded) — must never block the commit flow.
#
# MC task: c2778157 (Brain: auto-ingest pipeline)
#
# Usage:
#   bash scripts/mempalace-ingest-session.sh
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEMPALACE_DIR="${MEMPALACE_DIR:-$HOME/.mempalace}"
MARKER_FILE="$MEMPALACE_DIR/.last-ingest-ts"
FILTER_SCRIPT="$REPO_ROOT/services/mempalace/filter.py"
VENV_DIR="$REPO_ROOT/services/mempalace/.venv"

echo "[mempalace-ingest] Starting session-log ingest"

# ── Pre-flight: check venv and mempalace CLI ──
if [[ ! -d "$VENV_DIR" ]]; then
  echo "[mempalace-ingest] WARN: venv not found at $VENV_DIR — skipping ingest"
  exit 0
fi

if [[ ! -f "$VENV_DIR/bin/mempalace" ]]; then
  echo "[mempalace-ingest] WARN: mempalace CLI not found in venv — skipping ingest"
  exit 0
fi

if [[ ! -d "$MEMPALACE_DIR" ]]; then
  echo "[mempalace-ingest] WARN: $MEMPALACE_DIR not found — skipping ingest"
  exit 0
fi

# ── Wing mapping ──
get_wing() {
  local agent="$1"
  case "$agent" in
    chef|finance)   echo "Shishka" ;;
    coo|strategy)   echo "wing_strategy" ;;
    tech-lead|tech) echo "wing_tech" ;;
    *)              echo "Shishka" ;;
  esac
}

# ── Detect changed session-log files from HEAD commit ──
CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null || true)
SESSION_LOGS=$(echo "$CHANGED" | grep -E '^agents/.*/session-log\.md$' || true)

if [[ -z "$SESSION_LOGS" ]]; then
  echo "[mempalace-ingest] No session-log changes detected"
  exit 0
fi

# ── Read marker timestamp (seconds since epoch; default to 0) ──
LAST_TS=0
if [[ -f "$MARKER_FILE" ]]; then
  LAST_TS=$(cat "$MARKER_FILE" 2>/dev/null || echo 0)
fi
# Convert to YYYY-MM-DD for date comparison
if [[ "$LAST_TS" -gt 0 ]]; then
  LAST_DATE=$(date -r "$LAST_TS" +%Y-%m-%d 2>/dev/null || date -d "@$LAST_TS" +%Y-%m-%d 2>/dev/null || echo "1970-01-01")
else
  LAST_DATE="1970-01-01"
fi
echo "[mempalace-ingest] Last ingest date: $LAST_DATE"

# ── Process each changed session-log ──
INGESTED=0
SKIPPED=0

while IFS= read -r session_log; do
  [[ -z "$session_log" ]] && continue

  FULL_PATH="$REPO_ROOT/$session_log"
  if [[ ! -f "$FULL_PATH" ]]; then
    echo "[mempalace-ingest] SKIP $session_log (file not found)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Extract agent name from path: agents/{name}/session-log.md
  AGENT_NAME=$(echo "$session_log" | sed -E 's|^agents/([^/]+)/session-log\.md$|\1|')
  WING=$(get_wing "$AGENT_NAME")

  echo "[mempalace-ingest] Processing: $session_log (agent=$AGENT_NAME, wing=$WING)"

  # ── Extract sections newer than marker date ──
  # Session-log uses ## YYYY-MM-DD headers. Extract content from sections
  # where the date header is newer than LAST_DATE.
  TMPDIR=$(mktemp -d)
  EXTRACT_FILE="$TMPDIR/${AGENT_NAME}-session-extract.md"

  python3 -c "
import sys, os

last_date = '$LAST_DATE'
session_file = '$FULL_PATH'

with open(session_file, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines(keepends=True)
sections = []
current_date = None
current_lines = []

for line in lines:
    stripped = line.strip()
    # Match ## YYYY-MM-DD (possibly with extra text after)
    if stripped.startswith('## ') and len(stripped) >= 13:
        date_part = stripped[3:13]
        if len(date_part) == 10 and date_part[4] == '-' and date_part[7] == '-':
            # Save previous section
            if current_date and current_date > last_date and current_lines:
                sections.append(''.join(current_lines))
            current_date = date_part
            current_lines = [line]
            continue
    current_lines.append(line)

# Don't forget the last section
if current_date and current_date > last_date and current_lines:
    sections.append(''.join(current_lines))

if not sections:
    sys.exit(2)  # Nothing new

with open('$EXTRACT_FILE', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sections))
" 2>&1

  EXTRACT_EXIT=$?
  if [[ $EXTRACT_EXIT -eq 2 ]]; then
    echo "[mempalace-ingest] No new sections in $session_log (all older than $LAST_DATE)"
    rm -rf "$TMPDIR"
    continue
  elif [[ $EXTRACT_EXIT -ne 0 ]]; then
    echo "[mempalace-ingest] WARN: extraction error for $session_log"
    rm -rf "$TMPDIR"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # ── Pre-ingest filter gate ──
  if ! python3 "$FILTER_SCRIPT" "$EXTRACT_FILE" --quiet 2>&1; then
    echo "[mempalace-ingest] BLOCKED by filter: $session_log — skipping this file"
    rm -rf "$TMPDIR"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # ── Ingest via mempalace mine ──
  export ANONYMIZED_TELEMETRY=False
  if "$VENV_DIR/bin/mempalace" mine "$TMPDIR" \
      --mode convos \
      --wing "$WING" \
      --agent "$AGENT_NAME" 2>&1; then
    echo "[mempalace-ingest] OK: ingested $session_log into wing=$WING"
    INGESTED=$((INGESTED + 1))
  else
    echo "[mempalace-ingest] WARN: mempalace mine failed for $session_log"
    SKIPPED=$((SKIPPED + 1))
  fi

  rm -rf "$TMPDIR"
done <<< "$SESSION_LOGS"

# ── Update marker file with current timestamp ──
if [[ $INGESTED -gt 0 ]]; then
  date +%s > "$MARKER_FILE"
  echo "[mempalace-ingest] Updated marker: $MARKER_FILE"
fi

echo "[mempalace-ingest] Done: $INGESTED ingested, $SKIPPED skipped"
