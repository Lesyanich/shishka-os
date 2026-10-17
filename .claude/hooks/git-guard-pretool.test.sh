#!/bin/sh
# ============================================================
# Tests for .claude/hooks/git-guard-pretool.sh (RULE-GIT-HYGIENE, layer 2).
#
#   sh .claude/hooks/git-guard-pretool.test.sh     # from the repo root
#
# Feeds the hook the same PreToolUse JSON Claude Code sends and asserts
# the decision: deny (hard block) / warn (additionalContext) / silent.
#
# This is the allowed/denied matrix MC 8aafd8eb requires before the
# guard may be changed: a guard that silently stops denying is worse
# than the friction it removes, so every narrowing added there has a
# paired case proving the matching TRUE positive still denies.
#
# Fixtures: a throwaway repo in $TMPDIR stands in for "some other repo";
# the real topology of THIS repo (a parent checkout on main + a worktree
# off main) stands in for the cwd cases — a synthetic repo is correctly
# treated as "not ours" and would prove nothing.
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

# A worktree of THIS repo on an off-convention branch with no upstream —
# the only way to exercise WARN 3. Removed on exit.
ODD_WT=$(mktemp -d)/odd
ODD_BRANCH="claude/git-guard-selftest-$$"
if git worktree add -q -b "$ODD_BRANCH" "$ODD_WT" >/dev/null 2>&1; then ODD_OK=1; else ODD_OK=0; fi
cleanup() {
  rm -rf "$OTHER"
  [ "$ODD_OK" = "1" ] && git worktree remove --force "$ODD_WT" >/dev/null 2>&1
  [ "$ODD_OK" = "1" ] && git branch -q -D "$ODD_BRANCH" >/dev/null 2>&1
  rm -rf "$ODD_WT"
  return 0
}
trap cleanup EXIT INT TERM

# A sibling worktree of THIS repo, if one exists (else those cases skip).
SIBLING=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' \
          | grep -v "^$(git rev-parse --show-toplevel)$" | head -1)

pass=0; fail=0; skip=0

decide() {  # decide <payload> <hook_cwd>  → prints deny|warn|silent|other(...)
  out=$(printf '%s' "$1" | ( cd "$2" 2>/dev/null && sh "$HOOK_ABS" ) 2>&1)
  if   printf '%s' "$out" | grep -q '"permissionDecision": *"deny"'; then echo deny
  elif printf '%s' "$out" | grep -q 'additionalContext';             then echo warn
  elif [ -z "$out" ];                                                then echo silent
  else echo "other($out)"; fi
}
assert() {  # assert <expected> <label> <got>
  if [ "$3" = "$1" ]; then
    pass=$((pass + 1)); printf 'ok   %-54s → %s\n' "$2" "$3"
  else
    fail=$((fail + 1)); printf 'FAIL %-54s → got %s, want %s\n' "$2" "$3" "$1"
  fi
}

run() {  # run <deny|warn|silent> <label> <command>     (no cwd in payload)
  p=$(printf '%s' "$3" | jq -Rs '{tool_name:"Bash", tool_input:{command:.}}')
  assert "$1" "$2" "$(decide "$p" "$(pwd)")"
}
# run_in <deny|warn|silent> <label> <command> <payload_cwd> [hook_cwd]
# Sets the payload's `cwd` (empty = omit the key, i.e. an older payload)
# and spawns the hook from <hook_cwd> — MC 8aafd8eb is precisely about
# those two directories differing.
run_in() {
  hcwd=${5:-$PARENT}
  if [ -n "$4" ]; then
    p=$(printf '%s' "$3" | jq -Rs --arg c "$4" '{tool_name:"Bash", cwd:$c, tool_input:{command:.}}')
  else
    p=$(printf '%s' "$3" | jq -Rs '{tool_name:"Bash", tool_input:{command:.}}')
  fi
  assert "$1" "$2" "$(decide "$p" "$hcwd")"
}
skip() { skip=$((skip + 1)); printf 'skip %-54s (%s)\n' "$1" "$2"; }

PARENT=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)
HERE=$(git rev-parse --show-toplevel)
PARENT_BRANCH=$(git -C "$PARENT" rev-parse --abbrev-ref HEAD 2>/dev/null)
HERE_BRANCH=$(git -C "$HERE" rev-parse --abbrev-ref HEAD 2>/dev/null)
PARENT_UP=$(git -C "$PARENT" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)
ON_MAIN=0
[ "$PARENT_BRANCH" = "main" ] && [ "$HERE" != "$PARENT" ] && [ "$HERE_BRANCH" != "main" ] && ON_MAIN=1

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
run_in silent "cwd is another repo on main, commit" "git commit -m x"      "$OTHER" "$OTHER"
run_in silent "cwd is another repo on main, push"   "git push origin main" "$OTHER" "$(pwd)"

echo
echo "=== variant 5: judge the checkout the command RUNS IN ==="
# The hook is spawned in the PARENT (settings.json wires it by relative
# path) while the command runs in a worktree. Before the fix the parent's
# branch was judged, so a parent on main denied EVERY commit from EVERY
# worktree, on a correct feature branch.
if [ "$ON_MAIN" = "1" ]; then
  run_in deny   "parent on main, command runs in the parent"  "git commit -m x" "$PARENT" "$PARENT"
  run_in silent "worktree on a branch, hook spawned in parent" "git commit -m x" "$HERE"  "$PARENT"
  run_in silent "…and a push from that worktree, too"         "git push -u origin $HERE_BRANCH" "$HERE" "$PARENT"
  run_in deny   "no cwd in payload → falls back to hook cwd"  "git commit -m x" ""       "$PARENT"
  run_in deny   "explicit -C parent beats the payload cwd"    "git -C $PARENT commit -m x" "$HERE" "$HERE"
  run_in deny   "cd parent beats the payload cwd"             "cd $PARENT && git commit -m x" "$HERE" "$HERE"
else
  skip "variant 5 cwd cases" "needs a parent on main + a worktree off main"
fi

echo
echo "=== variant 2: --ff-only sync of main to its OWN upstream ==="
if [ "$ON_MAIN" = "1" ] && [ -n "$PARENT_UP" ]; then
  run_in silent "merge --ff-only \$upstream"                   "git merge --ff-only $PARENT_UP"  "$PARENT"
  run_in silent "merge --ff-only refs/remotes/\$upstream"      "git merge --ff-only refs/remotes/$PARENT_UP" "$PARENT"
  run_in silent "pull --ff-only (no arg → upstream)"           "git pull --ff-only"              "$PARENT"
  run_in silent "merge --ff-only \$upstream -q"                "git merge --ff-only $PARENT_UP -q" "$PARENT"
  # Condition 3 is load-bearing: --ff-only alone is NOT a licence.
  run_in deny   "merge --ff-only a feature branch"             "git merge --ff-only feature/tooling/x" "$PARENT"
  run_in deny   "merge --ff-only another remote's main"        "git merge --ff-only upstream/main" "$PARENT"
  run_in deny   "merge --ff-only a local ref named like it"    "git merge --ff-only main"        "$PARENT"
  run_in deny   "merge \$upstream without --ff-only"           "git merge $PARENT_UP"            "$PARENT"
  run_in deny   "merge --no-ff --ff-only \$upstream"           "git merge --no-ff --ff-only $PARENT_UP" "$PARENT"
  run_in deny   "merge --squash --ff-only \$upstream"          "git merge --squash --ff-only $PARENT_UP" "$PARENT"
  run_in deny   "merge --ff-only -m msg \$upstream"            "git merge --ff-only -m 'sync' $PARENT_UP" "$PARENT"
  run_in deny   "commit on main"                              "git commit -m x"                 "$PARENT"
  run_in deny   "cherry-pick on main"                          "git cherry-pick abc1234"         "$PARENT"
  run_in deny   "revert on main"                               "git revert abc1234"              "$PARENT"
  run_in silent "merge --ff-only is not even checked off main" "git merge --ff-only origin/anything" "$HERE"
else
  skip "variant 2 ff-only cases" "needs a parent on main with an upstream"
fi

echo
echo "=== variant 3: push from a main checkout, explicit non-main refspec ==="
if [ "$ON_MAIN" = "1" ]; then
  run_in silent "push a feature branch while on main"          "git push -u origin feature/tooling/x" "$PARENT"
  run_in silent "push main:feature (dest is not main)"         "git push origin main:feature/tooling/x" "$PARENT"
  run_in silent "delete a feature branch while on main"        "git push --delete origin feature/tooling/x" "$PARENT"
  run_in deny   "bare push while on main"                      "git push"                        "$PARENT"
  run_in deny   "push <remote> while on main"                  "git push origin"                 "$PARENT"
  run_in deny   "push -u origin HEAD while on main"            "git push -u origin HEAD"         "$PARENT"
  run_in silent "push -u origin HEAD off main"                 "git push -u origin HEAD"         "$HERE"
  run_in deny   "push --all while on main"                     "git push --all"                  "$PARENT"
  run_in deny   "push --all from a worktree (main included)"   "git push --all origin"           "$HERE"
  run_in deny   "push --mirror"                                "git push --mirror origin"        "$HERE"
else
  skip "variant 3 cases" "needs a parent on main"
fi

echo
echo "=== variant 4: a 'main' token that is not git's ==="
run_in silent "push feature && gh pr create --base main"       "git push -u origin feature/tooling/x && gh pr create --base main --title t --body b" "$HERE"
run_in deny   "…but push main && gh pr create still denies"    "git push origin main && gh pr create --base main" "$HERE"
run_in silent "gh pr create alone"                             "gh pr create --base main --title t" "$HERE"
run_in silent "commit message mentioning a push to main"       "git commit -m 'docs: never git push origin main'" "$HERE"
run_in silent "commit -F file whose name says main"            "git commit -F /tmp/push-origin-main.txt" "$HERE"
run_in silent "git log --oneline main"                         "git log --oneline main"          "$HERE"
run silent "non-git command mentioning main"                   "ls -la && echo main"
run silent "git log --grep push main"                          "git log --grep push --oneline main"
run_in silent "git fetch origin main"                          "git fetch origin main"           "$HERE"
run_in silent "git status"                                     "git status -sb"                  "$HERE"

echo
echo "=== variant 6: verbs that only LOOK like a mutation ==="
# `git merge-base` matched the old /git merge\b/ pattern, so reading the
# history from the main checkout was refused. The verb is now compared
# exactly, not as a prefix.
if [ "$ON_MAIN" = "1" ]; then
  run_in silent "git merge-base on the main checkout"             "git merge-base --is-ancestor origin/main HEAD" "$PARENT"
  run_in silent "git commit-graph write on the main checkout"     "git commit-graph write" "$PARENT"
  run_in silent "git cherry (not cherry-pick) on main"            "git cherry origin/main" "$PARENT"
  run_in silent "git revert-ish word in a pathspec"               "git log --oneline -- docs/revert-notes.md" "$PARENT"
  run_in deny   "git commit --amend on main still denies"         "git commit --amend --no-edit" "$PARENT"
else
  skip "variant 6 cases" "needs a parent on main"
fi

echo
echo "=== variant 1: flags after the refspec ==="
run_in silent "push -u origin feature/x -q"                    "git push -u origin feature/tooling/x -q" "$HERE"
run_in silent "push -o ci.skip -u origin feature/x"            "git push -o ci.skip -u origin feature/tooling/x" "$HERE"
run_in deny   "push origin main -q"                            "git push origin main -q"         "$HERE"
run_in deny   "push -q origin main"                            "git push -q origin main"         "$HERE"
run_in deny   "push --force-with-lease origin main"            "git push --force-with-lease origin main" "$HERE"

echo
echo "=== refspec forms that still deny ==="
run_in deny   "push origin HEAD:refs/heads/main"               "git push origin HEAD:refs/heads/main" "$HERE"
run_in deny   "push origin +main"                              "git push origin +main"           "$HERE"
run_in deny   "push origin :main (delete main)"                "git push origin :main"           "$HERE"
run_in deny   "push --delete origin main"                      "git push --delete origin main"   "$HERE"
run_in deny   "push origin feature/x main (two refspecs)"      "git push origin feature/tooling/x main" "$HERE"
run_in deny   "newline-separated push to main"                 "git status
git push origin main" "$HERE"

echo
echo "=== safety net: git hidden from the parser ==="
run_in deny   "eval push to main"                              "eval \"git push origin main\"" "$HERE"
run_in deny   "xargs git push main"                            "echo origin main | xargs git push" "$HERE"
run_in silent "echoing a git line into a file is not a push"   "echo \"git push origin main\" >> doc.md" "$HERE"
run_in deny   "sh -c push to main"                            "sh -c \"git push origin main\"" "$HERE"
if [ "$ON_MAIN" = "1" ]; then
  run_in deny   "eval commit while on main"                    "eval \"git commit -m x\""      "$PARENT"
  run_in deny   "sh -c commit while on main"                   "sh -c \"git commit -m x\""     "$PARENT"
  run_in silent "…but echoing that line is not a commit"       "echo \"git commit -m x\" >> doc.md" "$PARENT"
fi

echo
echo "=== WARN 3: off-convention branch, nothing pushed yet ==="
if [ "$ODD_OK" = "1" ]; then
  run_in warn   "commit on claude/* with no upstream"          "git commit -m x"                 "$ODD_WT"
  run_in silent "…and a push from it is fine"                  "git push -u origin $ODD_BRANCH"  "$ODD_WT"
  run_in silent "conforming branch stays quiet"                "git commit -m x"                 "$HERE"
else
  skip "WARN 3 cases" "could not create a scratch worktree"
fi

echo
echo "=== escape hatch (never advertised) ==="
run silent "escape hatch, push"                                "SHISHKA_ALLOW_MAIN=1 git push origin main"
if [ "$ON_MAIN" = "1" ]; then
  run_in silent "escape hatch, commit on main"                 "SHISHKA_ALLOW_MAIN=1 git commit -m x" "$PARENT"
fi

echo
printf 'passed=%s failed=%s skipped=%s\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
