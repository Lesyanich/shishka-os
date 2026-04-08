#!/usr/bin/env bash
# MemPalace restore — age decrypt + untar into $HOME.
# Spec: docs/plans/spec-mempalace-phase2.md §3.4
#
# Usage:
#   bash services/mempalace/restore.sh <path-to-mempalace-YYYYMMDD-HHMM.tar.age>
#
# The private key is fetched from Apple Keychain (Secure Note
# "MemPalace age private key"). Touch ID will prompt.
#
# SAFETY: if ~/.mempalace/ already exists, the script aborts unless
# MEMPALACE_FORCE_RESTORE=1 — prevents accidentally clobbering live data.

set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: $0 <archive.tar.age>" >&2
  exit 2
fi
if [[ ! -f "$ARCHIVE" ]]; then
  echo "ERROR: $ARCHIVE not found" >&2
  exit 1
fi

DEST_PARENT="$HOME"
LIVE_DIR="$HOME/.mempalace"

if [[ -e "$LIVE_DIR" && "${MEMPALACE_FORCE_RESTORE:-0}" != "1" ]]; then
  echo "ERROR: $LIVE_DIR already exists. Set MEMPALACE_FORCE_RESTORE=1 to overwrite." >&2
  exit 1
fi

# Sanity-check the Keychain entry exists BEFORE invoking age so we get a
# clearer error than `age: unknown identity type`.
if ! security find-generic-password -s "MemPalace age private key" >/dev/null 2>&1; then
  echo "ERROR: 'MemPalace age private key' not found in Keychain" >&2
  echo "Recovery card is stored in CEO safe (spec §7)." >&2
  exit 1
fi

# `security find-generic-password -w` emits the payload as a hex dump when
# the stored value contains any byte outside printable ASCII (newlines from
# age-keygen output count). If the first char is not a hex digit, it's plain
# ASCII and we pass it through; otherwise we xxd-decode. Either way the
# private key is piped straight into age via process substitution — never
# touches disk, never shows in ps, never lands in an env var.
decode_keychain() {
  local raw
  raw="$(security find-generic-password -s "MemPalace age private key" -w 2>/dev/null)"
  if [[ "$raw" =~ ^[0-9a-fA-F]+$ && $(( ${#raw} % 2 )) -eq 0 ]]; then
    printf '%s' "$raw" | xxd -r -p
  else
    printf '%s\n' "$raw"
  fi
}

age -d -i <(decode_keychain) "$ARCHIVE" | tar -C "$DEST_PARENT" -x

echo "[restore] restored from $ARCHIVE into $LIVE_DIR"
