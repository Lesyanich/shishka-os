#!/usr/bin/env bash
# MemPalace nightly backup — tar + age encrypt → GDrive-backed _backups/mempalace/.
# Spec: docs/plans/spec-mempalace-phase2.md §3.3
#
# Usage:
#   bash services/mempalace/backup.sh
#
# Env overrides:
#   MEMPALACE_SRC       default: ~/.mempalace
#   MEMPALACE_BACKUP_DIR  default: <repo-root>/_backups/mempalace
#   MEMPALACE_RETENTION_DAYS  default: 30
#
# The script is idempotent and safe to run under cron/launchd.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SRC="${MEMPALACE_SRC:-$HOME/.mempalace}"
DST="${MEMPALACE_BACKUP_DIR:-$REPO_ROOT/_backups/mempalace}"
RETENTION_DAYS="${MEMPALACE_RETENTION_DAYS:-30}"
RECIPIENT_FILE="$SCRIPT_DIR/age-recipient.txt"

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: source $SRC does not exist — nothing to back up" >&2
  exit 1
fi

if [[ ! -f "$RECIPIENT_FILE" ]]; then
  echo "ERROR: missing $RECIPIENT_FILE — cannot encrypt without public key" >&2
  exit 1
fi

RECIPIENT="$(tr -d '[:space:]' < "$RECIPIENT_FILE")"
if [[ -z "$RECIPIENT" ]]; then
  echo "ERROR: $RECIPIENT_FILE is empty" >&2
  exit 1
fi

mkdir -p "$DST"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="$DST/mempalace-$STAMP.tar.age"
TMP="$OUT.partial"

# tar the source parent so restore recreates ~/.mempalace/ in place
PARENT="$(dirname "$SRC")"
BASE="$(basename "$SRC")"

tar -C "$PARENT" -c "$BASE" \
  | age -r "$RECIPIENT" \
  > "$TMP"

mv "$TMP" "$OUT"
SIZE="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
echo "[backup] wrote $OUT ($SIZE bytes)"

# Rotate: delete backups older than retention window
find "$DST" -maxdepth 1 -type f -name 'mempalace-*.tar.age' -mtime "+${RETENTION_DAYS}" -print -delete

# Size watchdog — warn CEO if live data exceeds 5 GB (spec §7 risk table)
LIVE_BYTES="$(du -sk "$SRC" | awk '{print $1*1024}')"
if (( LIVE_BYTES > 5 * 1024 * 1024 * 1024 )); then
  echo "[backup] WARN: live ~/.mempalace/ exceeds 5 GB ($LIVE_BYTES bytes)" >&2
fi
