#!/usr/bin/env bash
# migration-number.sh — claim a SQL migration number atomically.
# MC c520decf · migration 483 · spec docs/plans/spec-migration-number-allocator.md
#
# WHY THIS EXISTS. A migration number used to be picked as "max + 1 at the moment
# I look" — by eyeballing `ls services/supabase/migrations`, or the max in
# origin/main. Neither is authoritative: numbers are consumed when a migration is
# APPLIED, so a branch that has not merged yet has already burned numbers above
# main's max. Two sessions looking in the same minute take the same number, and
# `migration-canary.sh --check-numbering` then blocks EVERY session in the repo
# from committing ANY migration until someone renumbers by hand. That happened
# four times on 2026-10-16 alone, and three bulk cleanups preceded it.
#
# Prod is the only place that knows. This asks it.
#
# Usage:
#   scripts/migration-number.sh next                     # advisory peek, claims nothing
#   scripts/migration-number.sh claim <slug>             # claim a number, print the filename
#   scripts/migration-number.sh letter <anchor> <slug>   # claim a letter suffix (repair path)
#   scripts/migration-number.sh status                   # collisions + open claims
#
#   --session <id>   session id to record (default: $CLAUDE_SESSION_ID, else user@host)
#
# Sessions with the Mission Control MCP should prefer the `claim_migration_number`
# tool — same allocator, no shell, no key handling.

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-https://qcqgtcsjoacuktcewpvo.supabase.co}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
MIGRATIONS_DIR="services/supabase/migrations"

SESSION_ID="${CLAUDE_SESSION_ID:-$(whoami)@$(hostname -s)}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --session) SESSION_ID="$2"; shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]:-}"

KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [ -z "$KEY" ] && command -v security >/dev/null 2>&1; then
  KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null || true)
fi
if [ -z "$KEY" ]; then
  echo "No SUPABASE_SERVICE_ROLE_KEY (env or Keychain)." >&2
  echo "Without it this cannot reach the allocator — do NOT fall back to guessing a" >&2
  echo "number from \`ls\`; that is the bug this script exists to prevent. Use the" >&2
  echo "Mission Control MCP tool claim_migration_number instead." >&2
  exit 1
fi

rpc() { # rpc <function> <json-body>
  curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/$1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$2"
}

get() { # get <path>
  curl -sS "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
}

# Extract a scalar from a single-row JSON array without needing jq.
pluck() { sed -E 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"?([^",}]*)"?.*/\1/'; }

case "${1:-}" in
  next)
    HW=$(rpc fn_migration_number_high_water '{}' | tr -d '[]" ')
    echo "high-water in prod: $HW"
    echo "next free number:   $((HW + 1))"
    echo ""
    echo "ADVISORY ONLY — this is not a reservation. Another session can take it a"
    echo "second from now. To actually hold it: $0 claim <slug>"
    ;;

  claim)
    SLUG="${2:-}"
    [ -n "$SLUG" ] || { echo "usage: $0 claim <slug>" >&2; exit 1; }
    BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    OUT=$(rpc fn_claim_migration_number \
      "{\"p_slug\":\"$SLUG\",\"p_session_id\":\"$SESSION_ID\",\"p_git_branch\":\"$BRANCH\"}")
    case "$OUT" in
      *'"filename"'*) : ;;
      *) echo "allocator refused the claim:" >&2; echo "$OUT" >&2; exit 1 ;;
    esac
    FILENAME=$(echo "$OUT" | pluck filename)
    echo "$FILENAME"
    echo "" >&2
    echo "Claimed by $SESSION_ID. Create:  $MIGRATIONS_DIR/$FILENAME" >&2
    echo "End the file with (checksum MUST be NULL — the canary rejects md5()):" >&2
    echo "" >&2
    echo "  INSERT INTO migration_log (filename, applied_by, checksum, notes)" >&2
    echo "  VALUES ('$FILENAME', '$SESSION_ID', NULL, '<what it does>');" >&2
    echo "" >&2
    echo "This number is yours and is never reissued. Abandon the work and it stays" >&2
    echo "burned — gap numbers are never reused, by design." >&2
    ;;

  letter)
    ANCHOR="${2:-}"; SLUG="${3:-}"
    [ -n "$ANCHOR" ] && [ -n "$SLUG" ] || { echo "usage: $0 letter <anchor> <slug>" >&2; exit 1; }
    BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    OUT=$(rpc fn_claim_migration_letter \
      "{\"p_anchor\":$ANCHOR,\"p_slug\":\"$SLUG\",\"p_session_id\":\"$SESSION_ID\",\"p_git_branch\":\"$BRANCH\"}")
    case "$OUT" in
      *'"filename"'*) echo "$OUT" | pluck filename ;;
      *) echo "allocator refused the claim:" >&2; echo "$OUT" >&2; exit 1 ;;
    esac
    echo "" >&2
    echo "Letter suffixes are for repairing an ALREADY-APPLIED duplicate." >&2
    echo "Ship the migration_log.filename UPDATE in the same branch as the rename." >&2
    echo "See $MIGRATIONS_DIR/RENUMBERING-2026-06-11.md" >&2
    ;;

  status)
    echo "=== duplicate numbers in the FILE TREE (this is what blocks commits) ==="
    DUPS=$(ls "$REPO_ROOT/$MIGRATIONS_DIR" 2>/dev/null \
            | grep -E '^[0-9]+[a-z]?_.*\.sql$' \
            | sed -E 's/^([0-9]+[a-z]?)_.*/\1/' | sort | uniq -d || true)
    if [ -n "$DUPS" ]; then
      echo "$DUPS" | sed 's/^/  BLOCKING: /'
    else
      echo "  none — the tree is clean"
    fi
    echo ""
    echo "=== log collisions formed AFTER the guard went live (should be empty) ==="
    get "v_migration_collisions?is_pre_guard=eq.false&select=prefix,filenames" \
      | sed 's/^/  /'
    echo ""
    echo "=== open claims (reserved, not yet applied) ==="
    get "migration_numbers?state=eq.reserved&select=number,letter,slug,session_id,git_branch,claimed_at&order=number" \
      | sed 's/^/  /'
    ;;

  *)
    sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
