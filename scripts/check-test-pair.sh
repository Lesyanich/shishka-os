#!/bin/sh

# ============================================================
# AI-TDD Gate (HC-3)
# Spec: docs/plans/spec-ai-native-ops.md
#
# Rule: Every NEW file in src/ must have a corresponding test.
# Applies to: apps/*/src/, services/mcp-*/src/
# Test patterns: __tests__/*.test.*, *.test.ts, *.test.tsx
# Only checks NEW files (not modifications to existing files).
# ============================================================

MISSING=0

# Get list of new (Added) files in src/ directories
NEW_SRC_FILES=$(git diff --cached --name-only --diff-filter=A | grep -E "(apps|services)/[^/]+/src/.*\.(ts|tsx)$" | grep -v "\.test\." | grep -v "\.spec\." | grep -v "__tests__/" | grep -v "\.d\.ts$")

if [ -z "$NEW_SRC_FILES" ]; then
  exit 0
fi

for SRC_FILE in $NEW_SRC_FILES; do
  # Extract base name without extension
  DIR=$(dirname "$SRC_FILE")
  BASENAME=$(basename "$SRC_FILE" | sed -E 's/\.(ts|tsx)$//')

  # Search for corresponding test file in staged files
  # Patterns: same-dir/*.test.ts, __tests__/*.test.ts
  FOUND_TEST=0

  # Check 1: co-located test (src/foo.test.ts alongside src/foo.ts)
  if git diff --cached --name-only --diff-filter=A | grep -qE "${DIR}/${BASENAME}\.(test|spec)\.(ts|tsx)$"; then
    FOUND_TEST=1
  fi

  # Check 2: __tests__ dir (src/__tests__/foo.test.ts)
  PARENT_DIR=$(dirname "$DIR")
  if git diff --cached --name-only --diff-filter=A | grep -qE "${PARENT_DIR}/__tests__/${BASENAME}\.(test|spec)\.(ts|tsx)$"; then
    FOUND_TEST=1
  fi

  # Check 3: __tests__ in same dir (src/tools/__tests__/foo.test.ts)
  if git diff --cached --name-only --diff-filter=A | grep -qE "${DIR}/__tests__/${BASENAME}\.(test|spec)\.(ts|tsx)$"; then
    FOUND_TEST=1
  fi

  if [ $FOUND_TEST -eq 0 ]; then
    echo "  MISSING TEST: $SRC_FILE"
    echo "    Expected: ${DIR}/${BASENAME}.test.ts or ${DIR}/__tests__/${BASENAME}.test.ts"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "HC-3 VIOLATION: $MISSING new src/ file(s) without tests."
  echo "Write tests BEFORE implementation (AI-TDD)."
  exit 1
fi

exit 0
