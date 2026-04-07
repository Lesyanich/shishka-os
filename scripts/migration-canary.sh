#!/usr/bin/env bash
# migration-canary.sh — Pre-flight validation for SQL migrations
# Phase D6: AI-Native Operations Modernization
#
# Usage: ./scripts/migration-canary.sh [migration_file.sql]
#   No args: validates all pending migrations (not in migration_log)
#   With arg: validates the specified file only
#
# Checks:
#   1. File has self-register INSERT INTO migration_log (Boris Rule #16)
#   2. Uses IF NOT EXISTS / IF EXISTS for safe re-runs
#   3. No DROP TABLE without explicit comment "-- INTENTIONAL DROP"
#   4. No TRUNCATE without explicit comment "-- INTENTIONAL TRUNCATE"
#   5. Syntax: basic SQL structure validation

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

  # 2. Safe DDL patterns
  if grep -qi 'ALTER TABLE.*ADD COLUMN' "$file" && ! grep -qi 'IF NOT EXISTS\|ADD COLUMN IF NOT EXISTS' "$file"; then
    warns+=("ADD COLUMN without IF NOT EXISTS — may fail on re-run")
  fi

  if grep -qi 'CREATE TABLE' "$file" && ! grep -qi 'IF NOT EXISTS' "$file"; then
    warns+=("CREATE TABLE without IF NOT EXISTS — may fail on re-run")
  fi

  # 3. Destructive operations
  if grep -qi 'DROP TABLE' "$file" && ! grep -q '-- INTENTIONAL DROP' "$file"; then
    issues+=("DROP TABLE without '-- INTENTIONAL DROP' comment")
  fi

  # 4. TRUNCATE check
  if grep -qi 'TRUNCATE' "$file" && ! grep -q '-- INTENTIONAL TRUNCATE' "$file"; then
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

# Main
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
