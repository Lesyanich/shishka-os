#!/bin/sh
# ============================================================
# Shishka OS — Git Hygiene Report  (RULE-GIT-HYGIENE)
# On-demand: `sh scripts/git-hygiene-report.sh`
#
# Local, git-only (no API/token needed). Fetches, then buckets the
# remote branches so accumulated clutter is VISIBLE instead of
# silently piling up:
#   🟢 merged into main but not deleted  → safe to delete
#   🔴 unmerged & stale (>14d)           → abandoned candidates
#   🟡 unmerged & recent (<=14d)         → probably live work
#
# Not wired to auto-run (keeps session start fast; complements the
# open session-start freshness work). Run it when you want a snapshot.
# ============================================================
set -u

BASE="origin/main"
STALE_DAYS="${1:-14}"

echo "Fetching latest remote state..."
git fetch origin --prune --quiet 2>/dev/null || { echo "fetch failed — showing cached state"; }

now=$(git log -1 --format=%ct "$BASE" 2>/dev/null || date +%s)

merged=0; stale=0; recent=0
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v 'origin/HEAD' | grep -vx 'origin/main'); do
  if git merge-base --is-ancestor "$b" "$BASE" 2>/dev/null; then
    merged=$((merged+1))
  else
    ts=$(git log -1 --format=%ct "$b" 2>/dev/null || echo "$now")
    days=$(( (now - ts) / 86400 ))
    if [ "$days" -le "$STALE_DAYS" ]; then
      recent=$((recent+1))
    else
      stale=$((stale+1))
    fi
  fi
done

echo
echo "════════ GIT HYGIENE — ${BASE} ════════"
echo "🟢 merged, not deleted   : $merged   (safe to delete — code is in main)"
echo "🔴 unmerged, stale >${STALE_DAYS}d : $stale   (abandoned candidates)"
echo "🟡 unmerged, recent      : $recent   (probably live — leave alone)"
echo
if [ "$merged" -gt 0 ]; then
  echo "→ Delete the merged ones (run on YOUR machine — session tokens"
  echo "  usually lack branch-delete rights; macOS xargs has no -r flag):"
  echo "  git branch -r --merged $BASE | grep -v HEAD | grep -vx '  origin/main' \\"
  echo "    | sed 's#origin/##' | xargs -n1 git push origin --delete"
fi
echo
echo "PRs are not counted here (needs the GitHub API). The systemic fix is"
echo "GitHub → Settings → General → 'Automatically delete head branches'."
