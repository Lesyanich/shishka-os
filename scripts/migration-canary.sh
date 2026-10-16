#!/usr/bin/env bash
# migration-canary.sh — Pre-flight validation for SQL migrations
# Phase D6: AI-Native Operations Modernization
#
# Usage: ./scripts/migration-canary.sh [migration_file.sql]
#   No args: validates all pending migrations (not in migration_log)
#   With arg: validates the specified file only
#   --check-numbering: validates migration numbering (collisions + monotonicity)
#
# Checks:
#   1. File has self-register INSERT INTO migration_log (RULE-MIGRATION-TRACKING)
#   2. Uses IF NOT EXISTS / IF EXISTS for safe re-runs
#   3. No DROP TABLE without explicit comment "-- INTENTIONAL DROP"
#   4. No TRUNCATE without explicit comment "-- INTENTIONAL TRUNCATE"
#   5. Syntax: basic SQL structure validation
#
# --check-numbering (MC 7e4f0f9c, audit-2026-06-11):
#   A. No two files in migrations/ may share a numeric prefix (081 vs 081a are distinct)
#   B. Staged NEW migrations must be numbered strictly above the max in HEAD
#   Numbers in the gaps may belong to migrations already applied to prod from
#   unmerged branches — never reuse a gap. If your branch carries a migration
#   already applied to prod whose number now collides, renumber the FILE to a
#   fresh number and ship a migration that UPDATEs its migration_log.filename
#   (see services/supabase/migrations/RENUMBERING-2026-06-11.md for precedent).
#
#   DON'T PICK A NUMBER BY LOOKING — that is what causes every failure below.
#   Claim one (MC c520decf, migration 483, RULE-MIGRATION-NUMBERING):
#       scripts/migration-number.sh claim <slug>
#     or the Mission Control MCP tool claim_migration_number(slug, session_id)
#   Numbers are consumed when a migration is APPLIED, so unmerged branches have
#   already burned numbers above HEAD's max and you cannot see them. prod's
#   migration_log is the only authority, and it now rejects a duplicate outright.
#
#   This check stays STRICT and OFFLINE on purpose: a pre-commit hook that needs
#   credentials and a network round-trip is a hook that gets bypassed. Never
#   loosen it to get a commit through — it is the thing that catches this.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
MIGRATIONS_DIR="$REPO_ROOT/services/supabase/migrations"
ERRORS=0
WARNINGS=0
CHECKED=0

validate_migration() {
  local file="$1"
  local basename=$(basename "$file")
  local issues=()
  local warns=()

  # 1. Self-register check (engineering-rules.md #16)
  # Match both `INSERT INTO migration_log` and the schema-qualified
  # `INSERT INTO public.migration_log` form.
  if ! grep -Eq 'INSERT INTO (public\.)?migration_log' "$file"; then
    issues+=("Missing self-register INSERT INTO migration_log")
  fi

  # 1b. Checksum must be NULL in self-register (RULE-MIGRATION-TRACKING)
  if grep -Eq "INSERT INTO (public\.)?migration_log" "$file" && grep -Eq "md5\('" "$file"; then
    # Allow references to md5() in comments or UPDATE statements (e.g. 101, 108)
    # Only flag if md5() appears in the INSERT VALUES clause
    if grep -A5 "INSERT INTO.*migration_log" "$file" | grep -q "md5('"; then
      issues+=("Self-register uses md5('filename') — must use NULL checksum (RULE-MIGRATION-TRACKING)")
    fi
  fi

  # 2. Safe DDL patterns
  if grep -qi 'ALTER TABLE.*ADD COLUMN' "$file" && ! grep -qi 'IF NOT EXISTS\|ADD COLUMN IF NOT EXISTS' "$file"; then
    warns+=("ADD COLUMN without IF NOT EXISTS — may fail on re-run")
  fi

  if grep -qi 'CREATE TABLE' "$file" && ! grep -qi 'IF NOT EXISTS' "$file"; then
    warns+=("CREATE TABLE without IF NOT EXISTS — may fail on re-run")
  fi

  # 3. Destructive operations
  if grep -qi 'DROP TABLE' "$file" && ! grep -q -- '-- INTENTIONAL DROP' "$file"; then
    issues+=("DROP TABLE without '-- INTENTIONAL DROP' comment")
  fi

  # 4. TRUNCATE check
  # Note: grep -q -- is required on macOS BSD grep because the pattern starts with '--'
  if grep -qi 'TRUNCATE' "$file" && ! grep -q -- '-- INTENTIONAL TRUNCATE' "$file"; then
    issues+=("TRUNCATE without '-- INTENTIONAL TRUNCATE' comment")
  fi

  # 5. Basic structure: file should not be empty
  if [ ! -s "$file" ]; then
    issues+=("Empty migration file")
  fi

  # Report
  CHECKED=$((CHECKED + 1))
  if [ ${#issues[@]} -gt 0 ]; then
    echo "FAIL  $basename"
    for issue in "${issues[@]}"; do
      echo "  ✗ $issue"
    done
    ERRORS=$((ERRORS + ${#issues[@]}))
  elif [ ${#warns[@]} -gt 0 ]; then
    echo "WARN  $basename"
    for warn in "${warns[@]}"; do
      echo "  ! $warn"
    done
    WARNINGS=$((WARNINGS + ${#warns[@]}))
  else
    echo "OK    $basename"
  fi
}

check_numbering() {
  local errors=0

  # A. Duplicate numeric prefixes anywhere in the migrations directory
  local dups
  dups=$(ls "$MIGRATIONS_DIR" | grep -E '^[0-9]+[a-z]?_.*\.sql$' | sed -E 's/^([0-9]+[a-z]?)_.*/\1/' | sort | uniq -d)
  if [ -n "$dups" ]; then
    echo "FAIL  numbering: duplicate migration number(s): $(echo "$dups" | tr '\n' ' ')"
    echo "  ✗ Two migrations sharing a number replay in undefined order."
    echo "  ✗ Until this is fixed, EVERY session in the repo is blocked from"
    echo "    committing ANY migration — not just you."
    echo "  ✗ Claim a fresh number for the NEWER file, do not pick one by eye:"
    echo "        scripts/migration-number.sh claim <slug>"
    echo "    (or the MC MCP tool claim_migration_number(slug, session_id))"
    echo "  ✗ If the newer file is ALREADY applied to prod, it needs a letter suffix"
    echo "    instead, plus a migration_log.filename UPDATE:"
    echo "        scripts/migration-number.sh letter <anchor> <slug>"
    echo "    See services/supabase/migrations/RENUMBERING-2026-06-11.md"
    echo "  ✗ Not yours? \`git fetch && git merge origin/main\` may already fix it —"
    echo "    a merged cleanup removes duplicates your stale worktree still has."
    errors=$((errors + 1))
  fi

  # B. Staged NEW migrations must be numbered strictly above the max in HEAD.
  # Skipped during merge commits: merging an old branch stages main's own
  # migrations as "added vs branch HEAD" — false positives. The duplicate
  # check (A) still guards merges; B re-fires on normal commits.
  if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
    if [ "$errors" -gt 0 ]; then
      echo ""
      echo "CANARY FAILED — migration numbering violations"
      exit 1
    fi
    echo "OK    numbering (merge commit: duplicate check only, $(ls "$MIGRATIONS_DIR" | grep -c -E '^[0-9]+[a-z]?_.*\.sql$') files, no collisions)"
    exit 0
  fi
  local head_max
  head_max=$(git ls-tree -r --name-only HEAD -- services/supabase/migrations 2>/dev/null \
    | sed -nE 's/.*\/([0-9]+)[a-z]?_.*\.sql$/\1/p' | sort -n | tail -1)
  if [ -n "$head_max" ]; then
    local added
    # Letter-suffixed files (e.g. 264a_) are exempt: that is the designated
    # slot-in mechanism for already-applied migrations arriving late (renumber
    # procedure / recovered files). Check A still protects them from duplicates.
    added=$(git diff --cached --name-only --diff-filter=A | grep -E '^services/supabase/migrations/[0-9]+_.*\.sql$' || true)
    for f in $added; do
      local base num
      base=$(basename "$f")
      num=$(echo "$base" | sed -E 's/^([0-9]+).*/\1/')
      if [ "$((10#$num))" -le "$((10#$head_max))" ]; then
        echo "FAIL  numbering: $base — number $num is not above current max ($head_max)"
        echo "  ✗ New migrations must use a number strictly greater than the max in HEAD."
        echo "  ✗ Gap numbers may already be applied to prod from unmerged branches — check migration_log."
        echo "  ✗ Claim the number instead of choosing it; prod knows what is free, HEAD does not:"
        echo "        scripts/migration-number.sh claim <slug>"
        echo "    (or the MC MCP tool claim_migration_number(slug, session_id))"
        echo "  ✗ If this migration is ALREADY applied to prod under this name, renumber the file"
        echo "    and ship a migration_log.filename UPDATE (see RENUMBERING-2026-06-11.md)."
        errors=$((errors + 1))
      elif [ "$((10#$num))" -gt "$((10#$head_max + 1))" ]; then
        echo "WARN  numbering: $base — skips ahead of max+1 ($((10#$head_max + 1)))"
        echo "  ! Allowed only when the skipped numbers are taken by applied-but-unmerged migrations."
        echo "  ! Expected if the number came from the allocator: it counts from prod's"
        echo "    migration_log, which is ahead of HEAD whenever a branch is unmerged."
        echo "  ! Verify: scripts/migration-number.sh status"
      fi
    done
  fi

  if [ "$errors" -gt 0 ]; then
    echo ""
    echo "CANARY FAILED — migration numbering violations"
    exit 1
  fi
  echo "OK    numbering ($(ls "$MIGRATIONS_DIR" | grep -c -E '^[0-9]+[a-z]?_.*\.sql$') files, no collisions, HEAD max $head_max)"
  exit 0
}

# --check-contract (repo boundary): the public menu at shishka.health reads
# menu_public, site_content, menu_modifiers and price_tiers with the anon key.
# Breaking one of them does not error the site — useMenu.js catches and renders
# hardcoded MOCK_DATA, so guests keep seeing a menu with last month's prices.
# This is the only gate that fires BEFORE the migration is applied.
#
# It cannot verify contracts/menu-contract.json, which lives in the other repo,
# so it demands the same explicit acknowledgement the DROP/TRUNCATE checks use.
check_contract() {
  local objects='menu_public|site_content|menu_modifiers|price_tiers|nomenclature_tags'
  local columns='customer_short_name|customer_photo_url|customer_description|customer_ingredients|bundle_min_price|stock_state|section_sort_order|category_sort_order'
  local staged errors=0
  staged=$(git diff --cached --name-only --diff-filter=ACMR \
    | grep -E '^services/supabase/migrations/.*\.sql$' || true)

  for f in $staged; do
    [ -f "$f" ] || continue
    if grep -Eqi "$objects|$columns" "$f"; then
      if ! grep -q -- '-- CONTRACT-REVIEWED' "$f"; then
        echo "FAIL  $(basename "$f") — touches the public menu contract"
        echo "  ✗ Matched: $(grep -Eoi "$objects|$columns" "$f" | sort -u | tr '\n' ' ')"
        echo "  ✗ shishka.health reads these. It breaks by showing stale prices, not by erroring."
        echo "  ✗ Do this, then add a '-- CONTRACT-REVIEWED: <why it is safe>' line to the migration:"
        echo "      1. node scripts/contract-check.mjs        (must be green BEFORE you apply)"
        echo "      2. update contracts/menu-contract.json in the shishka-health repo if columns moved"
        echo "      3. node scripts/contract-check.mjs        (must be green AFTER you apply)"
        errors=$((errors + 1))
      else
        echo "OK    $(basename "$f") — contract touch acknowledged"
      fi
    fi
  done

  if [ "$errors" -gt 0 ]; then
    echo ""
    echo "CANARY FAILED — unreviewed change to the shishka.health menu contract"
    exit 1
  fi
  echo "OK    contract (no unreviewed changes to the public menu contract)"
  exit 0
}

# Main
if [ "${1:-}" = "--check-numbering" ]; then
  check_numbering
fi
if [ "${1:-}" = "--check-contract" ]; then
  check_contract
fi
if [ $# -gt 0 ]; then
  # Validate specific file
  if [ -f "$1" ]; then
    validate_migration "$1"
  else
    echo "File not found: $1"
    exit 1
  fi
else
  # Validate all migrations
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    validate_migration "$f"
  done
fi

echo ""
echo "Checked: $CHECKED | Errors: $ERRORS | Warnings: $WARNINGS"

if [ "$ERRORS" -gt 0 ]; then
  echo "CANARY FAILED — fix errors before applying migrations"
  exit 1
fi
