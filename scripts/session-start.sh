#!/bin/sh
# ============================================================
# Shishka OS — Session Start Reminder
# Prints context for Claude Code agent at session start.
# This is a REMINDER, not enforcement — the agent must act.
# ============================================================

echo "=== Shishka OS Session Start ==="
echo ""

# Current branch
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "Branch: $BRANCH"

# Last commit
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "no commits")
echo "Last commit: $LAST_COMMIT"

# Dirty tree check
DIRTY=$(git status --porcelain 2>/dev/null | head -5)
if [ -n "$DIRTY" ]; then
  DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo "⚠ Dirty tree: $DIRTY_COUNT modified files"
fi

echo ""
echo "→ Read CLAUDE.md L0 protocol"
echo "→ Check MC tasks: list_tasks(status='in_progress')"
echo "→ If no tasks: list_tasks(status='inbox', priority='critical')"
echo ""
echo "Agents:"
echo "  /chef     — menu, BOM, recipes, kitchen"
echo "  /finance  — receipts, expenses, suppliers"
echo "  /coo      — coordination, triage, architecture"
echo ""
echo "Or just say what you need — auto-routing will find the right agent."
echo ""
echo "=== Ready ==="
