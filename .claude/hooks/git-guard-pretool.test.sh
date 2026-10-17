#!/bin/sh
# ============================================================
# Tests for .claude/hooks/git-guard-pretool.sh (RULE-GIT-HYGIENE, layer 2).
#
#   sh .claude/hooks/git-guard-pretool.test.sh     # from the repo root
#
# Feeds the hook the same PreToolUse JSON Claude Code sends and asserts
# the decision: deny (hard block) / warn (additionalContext) / silent.
# Self-contained: builds a throwaway repo in $TMPDIR to stand in for
# "some other repo". Requires jq (the hook fails open without it).
# ============================================================

HOOK=".claude/hooks/git-guard-pretool.sh"
[ -f "$HOOK" ] || { echo "run me from the repo root"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
# Absolute, so a case can run the hook from a different cwd.
HOOK_ABS="$(cd "$(dirname "$HOOK")" && pwd)/$(basename "$HOOK")"

# A real git repo that is NOT this one, sitting on main.
OTHER=$(mktemp -d)/other
mkdir -p "$OTHER"
( cd "$OTHER" && git init -q -b main . && git commit -q --allow-empty -m init ) || exit 1
trap 'rm -rf "$OTHER"' EXIT INT TERM

# A sibling worktree of THIS repo, if one exists (else those cases skip).
SIBLING=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' \
          | grep -v "^$(git rev-parse --show-toplevel)$" | head -1)

pass=0; fail=0; skip=0

run() {  # run <deny|warn|silent> <label> <command>
  exp=$1; label=$2; cmd=$3
  out=$(printf '%s' "$cmd" | jq -Rs '{tool_name:"Bash", tool_input:{command:.}}' | sh "$HOOK" 2>&1)
  if   printf '%s' "$out" | grep -q '"permissionDecision": *"deny"'; then got=deny
  elif printf '%s' "$out" | grep -q 'additionalContext';             then got=warn
  elif [ -z "$out" ];                                                then got=silent
  else got="other($out)"; fi
  if [ "$got" = "$exp" ]; then
    pass=$((pass + 1)); printf 'ok   %-50s → %s\n' "$label" "$got"
  else
    fail=$((fail + 1)); printf 'FAIL %-50s → got %s, want %s\n' "$label" "$got" "$exp"
  fi
}
skip() { skip=$((skip + 1)); printf 'skip %-50s (%s)\n' "$1" "$2"; }

# run_in <deny|warn|silent> <label> <command> <payload_cwd> <hook_cwd>
# Same as run(), but sets the payload's `cwd` (empty = omit the key, i.e.
# an older payload) and spawns the hook from <hook_cwd>. Needed because
# MC 8aafd8eb is precisely about those two directories differing.
run_in() {
  exp=$1; label=$2; cmd=$3; pcwd=$4; hcwd=$5
  if [ -n "$pcwd" ]; then
    payload=$(printf '%s' "$cmd" | jq -Rs --arg c "$pcwd" \
      '{tool_name:"Bash", cwd:$c, tool_input:{command:.}}')
  else
    payload=$(printf '%s' "$cmd" | jq -Rs '{tool_name:"Bash", tool_input:{command:.}}')
  fi
  out=$(printf '%s' "$payload" | ( cd "$hcwd" 2>/dev/null && sh "$HOOK_ABS" ) 2>&1)
  if   printf '%s' "$out" | grep -q '"permissionDecision": *"deny"'; then got=deny
  elif printf '%s' "$out" | grep -q 'additionalContext';             then got=warn
  elif [ -z "$out" ];                                                then got=silent
  else got="other($out)"; fi
  if [ "$got" = "$exp" ]; then
    pass=$((pass + 1)); printf 'ok   %-50s → %s\n' "$label" "$got"
  else
    fail=$((fail + 1)); printf 'FAIL %-50s → got %s, want %s\n' "$label" "$got" "$exp"
  fi
}

echo "=== still protects THIS repo ==="
run deny   "push origin main"                       "git push origin main"
run deny   "push HEAD:main"                         "git push origin HEAD:main"
run deny   "cd \$PWD && push main"                  "cd $(pwd) && git push origin main"
run deny   "unresolvable path → falls back to deny" "cd /nope/not/here && git push origin main"
run deny   "path from a variable → falls back"      "cd \$SOMEDIR && git push origin main"
if [ -n "$SIBLING" ]; then
  run deny "sibling worktree, push main"            "cd $SIBLING && git push origin main"
  run deny "git -C sibling worktree, push main"     "git -C $SIBLING push origin main"
else
  skip "sibling worktree cases" "no second worktree"
fi

echo
echo "=== silent on OTHER repos (the false-denial this fixes) ==="
run silent "cd other && push main"                  "cd $OTHER && git push origin main"
run silent "git -C other push main"                 "git -C $OTHER push origin main"
run silent "cd other && commit while on main"       "cd $OTHER && git commit -m x"
run silent "quoted path"                            "cd \"$OTHER\" && git push origin main"
run silent "single-quoted path"                     "cd '$OTHER' && git push origin main"
run silent "-C beats an earlier cd"                 "cd $(pwd) && git -C $OTHER push origin main"

echo
echo "=== MC 8aafd8eb — judge the checkout the command RUNS IN ==="
# The real topology, not a synthetic one: this repo's parent checkout plus
# this worktree, with the hook spawned in the PARENT while the command
# runs HERE. Before the fix, the parent's branch was the one judged, so a
# parent sitting on main denied every commit from every worktree.
PARENT=$(dirname "$(git rev-parse --git-common-dir 2>/dev/null)")
HERE=$(git rev-parse --show-toplevel 2>/dev/null)
PARENT_BRANCH=$(git -C "$PARENT" rev-parse --abbrev-ref HEAD 2>/dev/null)
HERE_BRANCH=$(git -C "$HERE" rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$PARENT_BRANCH" = "main" ] && [ "$HERE" != "$PARENT" ] && [ "$HERE_BRANCH" != "main" ]; then
  run_in deny   "parent on main, command runs in the parent"   "git commit -m x" "$PARENT" "$PARENT"
  run_in silent "worktree on a branch, hook spawned in parent" "git commit -m x" "$HERE"   "$PARENT"
  run_in silent "…and a push from that worktree, too"          "git push -u origin $HERE_BRANCH" "$HERE" "$PARENT"
  run_in deny   "no cwd in payload → falls back to hook cwd"   "git commit -m x" ""        "$PARENT"
  run_in deny   "explicit -C parent beats the payload cwd"     "git -C $PARENT commit -m x" "$HERE" "$HERE"
else
  skip "MC 8aafd8eb cwd cases" "needs a parent on main + a worktree off main"
fi

echo
echo "=== other repos stay silent even when the payload names them ==="
run_in silent "cwd is another repo on main, commit"  "git commit -m x"      "$OTHER" "$OTHER"
run_in silent "cwd is another repo on main, push"    "git push origin main" "$OTHER" "$(pwd)"

echo
echo "=== unchanged behaviour ==="
run silent "non-git command mentioning main"        "ls -la && echo main"
run silent "push a feature branch"                  "git push -u origin feature/tooling/x"
run silent "escape hatch"                           "SHISHKA_ALLOW_MAIN=1 git push origin main"
run silent "git log --grep push main"               "git log --grep push --oneline main"

echo
printf 'passed=%s failed=%s skipped=%s\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
