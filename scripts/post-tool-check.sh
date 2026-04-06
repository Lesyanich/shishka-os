#!/bin/sh
# ============================================================
# Shishka OS — PostToolUse Check
# Runs after Bash commands. If the command was a git commit,
# triggers a build check for affected projects.
# ============================================================

# The tool input is passed via stdin or env — check if last command was git commit
# Claude Code PostToolUse receives tool output; we check for commit indicators
INPUT="${TOOL_INPUT:-}"

# Only trigger on git commit commands
echo "$INPUT" | grep -q "git commit" 2>/dev/null || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO_ROOT" ] && exit 0

echo ""
echo "[post-commit-check] Verifying build after commit..."

# Check if admin-panel was modified in last commit
if git diff HEAD~1 --name-only 2>/dev/null | grep -q "^apps/admin-panel/"; then
  echo "[build] Checking admin-panel..."
  cd "$REPO_ROOT/apps/admin-panel"
  npx tsc --noEmit 2>&1
  BUILD_EXIT=$?
  cd "$REPO_ROOT"
  if [ $BUILD_EXIT -ne 0 ]; then
    echo "⚠ BUILD FAILED in admin-panel. Fix before continuing."
    exit 0  # exit 0 so we don't block the agent, just warn
  fi
  echo "[build] admin-panel OK"
fi

echo "[post-commit-check] Done"
