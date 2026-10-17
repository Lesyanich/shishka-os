#!/bin/sh
# ============================================================
# Shishka OS — Git Guard Hook
# Hook event: PreToolUse
# Matcher:    Bash
#
# Enforces RULE-GIT-HYGIENE at the terminal, before the command runs:
#   1. HARD BLOCK — local mutation of `main` (commit / merge /
#                   cherry-pick / revert while the TARGET CHECKOUT is on
#                   main). Sanctioned exception: a pure pointer advance
#                   of main to its OWN upstream (`merge|pull --ff-only
#                   origin/main`) — creates no commit, reviews nothing.
#   2. HARD BLOCK — `git push` whose REFSPEC targets main (main is
#                   PR-only). With no explicit refspec the push goes to
#                   the current branch, so the checkout's branch decides.
#   3. WARN       — off-convention branch name (feature|fix|chore|docs|
#                   refactor|perf|security/...). Fires ONLY while the
#                   branch has no upstream yet: before the first push a
#                   rename is free; after it, renaming breaks the PR,
#                   so silence beats bad advice.
#
# HOW IT READS A COMMAND (MC 8aafd8eb). The guard used to pattern-match
# the raw command TEXT plus the ambient branch. That produced five
# distinct classes of false denial — a trailing `-q`, a `--ff-only` sync,
# any push from a checkout that happened to sit on main, a bare `main`
# token belonging to a chained `gh pr create --base main`, and every
# commit made from a worktree. All five were one root cause, so the fix
# is one change: tokenize the command (quote-aware), split it into
# segments at `; & | ( ) ` + newlines, and judge each `git` invocation by
# ITS OWN verb, options and refspecs. A `main` inside a quoted commit
# message, or in the arguments of a chained non-git command, is therefore
# no longer visible to the guard at all.
#
# Escape hatch (sanctioned automation ONLY, e.g. the data-health
# sheriff): prefix the command — `SHISHKA_ALLOW_MAIN=1 git commit …`.
# The guard greps the prefix out of the command TEXT (an env var set
# inside the Bash call is invisible to this hook process) and also
# honours it in its own env for cron-configured runners. Deliberately
# NOT advertised in deny messages.
#
# Scope: THIS repo only. A command may target another one (`cd ~/other
# && git push origin main`, `git -C /elsewhere commit`). Judging a
# foreign repo by this repo's rules produced false denials — the
# agent-memory store is a private notes repo whose main is not a deploy
# target, yet its pushes were blocked by a rule about shishka-os
# production. So: resolve each segment's target repo and skip the ones
# that are not ours. Repo identity is the SHARED git dir
# (`--git-common-dir`), so sibling worktrees of shishka-os all count as
# ours — their toplevels differ, their common dir does not. "Ours" is
# anchored on where THIS SCRIPT lives, the one identity that cannot
# drift when the session, the command and the hook process sit in three
# different directories.
#
# WHICH CHECKOUT GETS JUDGED. A commit mutates the repo of the directory
# the command runs IN, so that is the branch to judge — the payload's
# `cwd`, not this hook process's cwd. They are not the same: the hook is
# spawned in the parent checkout (`.claude/settings.json` wires it by
# relative path) while the command runs in a worktree. That cost us a
# whole class of false denials: the parent sits on main, so BLOCK 1
# refused EVERY commit from EVERY worktree, on a correct feature branch,
# reporting "refusing to modify main locally".
# Precedence: `git -C <dir>` > `cd <dir>` > payload cwd > this process's
# cwd (the last only as a fallback, so a payload without `cwd` keeps the
# old enforcing behaviour).
#
# Known limits (this layer stops accidents, not adversaries — the
# server-side GitHub protection is the real fence):
#   - a path built from a variable does not resolve → we fall back to
#     the session repo, i.e. toward enforcing rather than skipping
#   - a refspec built from a variable (`git push origin $B`) is opaque;
#     the ambient-branch test still applies
#   - `eval`/`sh -c` bodies are re-tokenized, but a git call whose
#     arguments arrive from stdin (`… | xargs git push`) is unknowable;
#     for those shapes the pre-8aafd8eb crude text match runs as a
#     safety net, so they stay blocked rather than silently allowed
#
# Fail-OPEN on infra errors (no stdin, no jq, git errors): we only
# block a PROVEN write to main — never on uncertainty.
#
# Tests: sh .claude/hooks/git-guard-pretool.test.sh   (from the repo root)
# ============================================================

# --- Read hook payload from stdin ---
# This hook runs before EVERY Bash call, so the fast path must be cheap:
# in a sandbox each forked process costs tens of milliseconds. Hence the
# shell-builtin pre-filter before jq, one jq call instead of three, and
# `case` instead of grep wherever a literal match will do.
[ -t 0 ] && exit 0                          # No stdin → not a hook invocation → noop
PAYLOAD=$(cat 2>/dev/null || true)
[ -z "$PAYLOAD" ] && exit 0
# Zero-fork pre-filter: a payload that never says "git" cannot carry a
# git command. The `\u` arm keeps JSON-escaped text out of the fast path.
case "$PAYLOAD" in *git*) : ;; *'\u'*) : ;; *) exit 0 ;; esac
command -v jq >/dev/null 2>&1 || exit 0     # Fail-open if jq missing

NL='
'
# One jq, three results: tool name, cwd, then the command — which may
# itself be multi-line, so it comes last and takes the rest.
ALL=$(printf '%s' "$PAYLOAD" | jq -r '.tool_name, (.cwd // ""), (.tool_input.command // "")' 2>/dev/null)
TOOL=${ALL%%"$NL"*}
[ "$TOOL" = "Bash" ] || exit 0
REST=${ALL#*"$NL"}
SESSION_DIR=${REST%%"$NL"*}
CMD=${REST#*"$NL"}
[ -z "$CMD" ] && exit 0

# Cheap early-out: only commands that could invoke git. The quote and
# `/` cases matter — `eval "git push …"` and `/usr/bin/git push` are
# invocations too, and the pre-8aafd8eb class missed both.
printf '%s' "$CMD" | grep -qE '(^|[;&|( ="'"'"'/])git([ (]|$)' || exit 0

# The directory the command will actually run in (read above from the
# payload). Absent in older payloads → fall back to this process's cwd,
# which is the pre-8aafd8eb behaviour.
[ -n "$SESSION_DIR" ] && [ -d "$SESSION_DIR" ] || SESSION_DIR="."

# Escape hatch: command-text prefix (the real path — env vars inside the
# Bash call never reach this process) or hook env (cron runners).
[ "${SHISHKA_ALLOW_MAIN:-}" = "1" ] && exit 0
case "$CMD" in *SHISHKA_ALLOW_MAIN=1*) exit 0 ;; esac

# --- Repo identity: the SHARED git dir, so every worktree resolves equal.
# Prints nothing when $1 is not inside a git repo. ---
repo_id() {
  ( cd "$1" 2>/dev/null || exit 0
    g=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
    [ -n "$g" ] || exit 0
    cd "$g" 2>/dev/null || exit 0
    pwd -P ) 2>/dev/null
}
# Computed on first use, not at startup: a command that parses to no git
# invocation never pays for it.
OWN_ID=
own_id() {
  [ -n "$OWN_ID" ] || OWN_ID=$(repo_id "$(dirname "$0")")
  [ -n "$OWN_ID" ]
}

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}
warn() {
  jq -n --arg ctx "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
  exit 0
}
DENY_MUT="RULE-GIT-HYGIENE — refusing to modify 'main' locally (commit/merge/cherry-pick/revert). main is PR-only. Move the work to a branch:
  git checkout -b feature/{project}/{description}
  (project = admin|web|app|agents|security|tooling|docs|cleanup)
then commit there and open a PR. (Syncing this checkout to its own upstream is allowed: git merge --ff-only origin/main.) If this is sanctioned automation, its runbook documents the bypass (see RULE-GIT-HYGIENE)."
DENY_PUSH="RULE-GIT-HYGIENE — refusing to PUSH to 'main'. main ships to production and is PR-only. Push a feature branch instead:
  git push -u origin feature/{project}/{description}
and open a Pull Request. If this is sanctioned automation, its runbook documents the bypass (see RULE-GIT-HYGIENE)."

# ---------------------------------------------------------------
# Tokenize → segments → one block of tagged lines per git invocation:
#   S            start of a git segment
#   D<dir>       effective dir (`git -C`, else a preceding `cd`, else "")
#   V<verb>      subcommand in verb position
#   O<option>    one option token belonging to the verb
#   P<arg>       one positional argument, in order
# Quote-aware, so a quoted commit message is ONE token and its contents
# can never be read as a refspec. `eval`/`sh -c` bodies are queued and
# re-tokenized, so the guard sees the git call they really run.
# ---------------------------------------------------------------
SEGS=$(printf '%s' "$CMD" | awk '
function push_tok() { if (have) { nt++; T[nt] = tok } tok = ""; have = 0 }
function takes_value(o) {
  return (o == "-m" || o == "--message" || o == "-F" || o == "--file" ||
          o == "-o" || o == "--push-option" || o == "--repo" ||
          o == "--receive-pack" || o == "--exec" || o == "-s" ||
          o == "--strategy" || o == "-X" || o == "--strategy-option" ||
          o == "-S" || o == "--gpg-sign" || o == "-C" ||
          o == "--reuse-message" || o == "-c" || o == "--reedit-message" ||
          o == "--into-name" || o == "--log")
}
function enqueue(s) { if (s != "" && qn < 20) { qn++; queue[qn] = s } }
function emit(   j, k, m, x, o, t, dir, s) {
  j = 1
  while (j <= nt && (T[j] ~ /^[A-Za-z_][A-Za-z0-9_]*=/ || T[j] == "env" ||
                     T[j] == "command" || T[j] == "nohup" || T[j] == "time")) j++
  if (j > nt) return
  if (T[j] == "cd" || T[j] == "pushd") { if (j + 1 <= nt) curdir = T[j+1]; return }
  # Wrappers that carry a shell command of their own → look inside.
  if (T[j] == "eval") {
    s = ""
    for (x = j + 1; x <= nt; x++) s = s (x > j + 1 ? " " : "") T[x]
    enqueue(s); return
  }
  if (T[j] ~ /(^|\/)(sh|bash|zsh|dash)$/) {
    for (x = j + 1; x <= nt; x++) if (T[x] == "-c") { if (x + 1 <= nt) enqueue(T[x+1]); return }
    return
  }
  if (T[j] !~ /(^|\/)git$/) return
  dir = ""; k = j + 1
  while (k <= nt && substr(T[k], 1, 1) == "-") {
    o = T[k]
    if (o == "-C" || o == "-c" || o == "--namespace" || o == "--git-dir" ||
        o == "--work-tree" || o == "--exec-path") {
      if (o == "-C" && k + 1 <= nt) dir = T[k+1]
      k += 2; continue
    }
    k++
  }
  if (k > nt) return
  if (dir == "") dir = curdir
  print "S"
  print "D" dir
  print "V" T[k]
  m = k + 1
  while (m <= nt) {
    t = T[m]
    if (length(t) > 1 && substr(t, 1, 1) == "-") {
      print "O" t
      if (takes_value(t) && m + 1 <= nt && substr(T[m+1], 1, 1) != "-") m += 2
      else m++
      continue
    }
    print "P" t
    m++
  }
}
function flush_seg() { push_tok(); if (nt > 0) emit(); nt = 0 }
function tokenize(s,   n, i, c) {
  q = ""; tok = ""; have = 0; nt = 0
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (q == SQ) { if (c == SQ) q = ""; else { tok = tok c; have = 1 } ; continue }
    if (q == "\"") {
      if (c == "\"") { q = ""; continue }
      if (c == "\\" && i < n) { i++; tok = tok substr(s, i, 1); have = 1; continue }
      tok = tok c; have = 1; continue
    }
    if (c == SQ || c == "\"") { q = c; have = 1; continue }
    if (c == "\\" && i < n) { i++; tok = tok substr(s, i, 1); have = 1; continue }
    if (c == " " || c == TB) { push_tok(); continue }
    if (c == "\n" || c == ";" || c == "&" || c == "|" || c == "(" || c == ")" || c == "`") {
      flush_seg(); continue
    }
    tok = tok c; have = 1
  }
  flush_seg()
}
BEGIN { SQ = sprintf("%c", 39); TB = sprintf("%c", 9); curdir = ""; qn = 0 }
{ blob = (NR > 1 ? blob "\n" : "") $0 }
END {
  tokenize(blob)
  for (x = 1; x <= qn; x++) tokenize(queue[x])
}')

# ---------------------------------------------------------------
# Judge each parsed git segment.
# ---------------------------------------------------------------
seg_reset() { sdir=""; verb=""; opts=""; np=0; p1=""; ref_main=0; ref_head=0; ref_other=0; }

has_opt() { case " $opts " in *" $1 "*) return 0 ;; esac; return 1; }

# `--ff-only` to the branch's OWN upstream: a pointer advance to a ref
# that already exists on the remote. Condition 3 (target == upstream) is
# load-bearing: `git merge --ff-only feature/x` also fast-forwards, but
# it lands unreviewed local work on main — exactly what BLOCK 1 exists
# to stop. So resolve the upstream and compare; never just grep --ff-only.
ff_sync_to_own_upstream() {
  has_opt --ff-only || return 1
  has_opt --no-ff && return 1
  has_opt --squash && return 1
  has_opt -m && return 1
  has_opt --message && return 1
  [ "$np" -le 1 ] || return 1
  up=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null) || return 1
  [ -n "$up" ] || return 1
  [ "$np" -eq 0 ] && return 0                 # no arg → git uses the upstream
  t=${p1#refs/remotes/}
  [ "$t" = "$up" ]
}

judge_seg() {
  [ -n "$verb" ] || return 0

  # --- which checkout does THIS segment touch? ---
  d=$sdir
  case "$d" in "~") d="$HOME" ;; "~/"*) d="$HOME/${d#\~/}" ;; esac
  [ -n "$d" ] || d="$SESSION_DIR"
  cid=$(repo_id "$d")
  if [ -z "$cid" ]; then
    d="$SESSION_DIR"                          # unresolvable → fall back to enforcing
    cid=$(repo_id "$d")
  fi
  # Resolvably a DIFFERENT repo → not ours to police. Stay silent.
  own_id && [ -n "$cid" ] && [ "$cid" != "$OWN_ID" ] && return 0

  # Toplevel and branch in ONE git call (rev-parse honours both flags and
  # answers in order).
  rp=$( (cd "$d" 2>/dev/null && git rev-parse --show-toplevel --abbrev-ref HEAD 2>/dev/null) )
  REPO_ROOT=${rp%%"$NL"*}
  BRANCH=${rp#*"$NL"}
  [ "$REPO_ROOT" = "$BRANCH" ] && BRANCH=""      # single line → no branch answer
  [ -n "$REPO_ROOT" ] || REPO_ROOT=$d

  # ---- BLOCK 1: local mutation of main ----
  case "$verb" in
    commit|merge|cherry-pick|revert)
      if [ "$BRANCH" = "main" ]; then
        case "$verb" in
          merge|pull) ff_sync_to_own_upstream && return 0 ;;
        esac
        deny "$DENY_MUT"
      fi
      # ---- WARN 3: off-convention branch name (only before first push) ----
      if [ -n "$BRANCH" ]; then
        case "$BRANCH" in
          feature/*|fix/*|chore/*|docs/*|refactor/*|perf/*|security/*) : ;;
          *)
            if ! git -C "$REPO_ROOT" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
              warn "RULE-GIT-HYGIENE — branch '$BRANCH' is off-convention. Preferred: feature/{project}/{description} (or fix|chore|docs|refactor|perf|security/...). Auto-generated 'claude/*' names carry no meaning. Rename NOW, while nothing is pushed:
  git branch -m feature/{project}/{description}"
            fi
            ;;
        esac
      fi
      ;;
  esac

  # ---- BLOCK 2: push targeting main ----
  if [ "$verb" = "push" ]; then
    t=0
    has_opt --all && t=1                      # pushes every branch, main included
    has_opt --mirror && t=1
    [ "$ref_main" = "1" ] && t=1
    # No explicit refspec (bare push / `push <remote>`), or the refspec
    # resolves to HEAD → the push goes to the CURRENT branch.
    if [ "$ref_main" = "0" ] && { [ "$ref_other" = "0" ] || [ "$ref_head" = "1" ]; }; then
      [ "$BRANCH" = "main" ] && t=1
    fi
    [ "$t" = "1" ] && deny "$DENY_PUSH"
  fi
  return 0
}

# Classify a push refspec by its DESTINATION (`src:dst`, else the whole
# token); `+` force prefix and `refs/heads/` are noise.
classify_ref() {
  r=$1
  r=${r#+}
  case "$r" in *:*) r=${r#*:} ;; esac
  r=${r#refs/heads/}
  case "$r" in
    main)    ref_main=1 ;;
    HEAD|@)  ref_head=1 ;;
    "")      ref_main=1 ;;                    # `origin :main`-style delete of main
    *)       ref_other=1 ;;
  esac
}

seg_reset
if [ -n "$SEGS" ]; then
  while IFS= read -r line; do
    tag=${line%"${line#?}"}
    val=${line#?}
    case "$tag" in
      S) judge_seg; seg_reset ;;
      D) sdir=$val ;;
      V) verb=$val ;;
      O) opts="$opts $val" ;;
      P) np=$((np + 1))
         [ "$np" = "1" ] && p1=$val
         if [ "$verb" = "push" ] && [ "$np" -ge 2 ]; then classify_ref "$val"; fi
         ;;
    esac
  done <<SEG_EOF
$SEGS
SEG_EOF
  judge_seg
  exit 0
fi

# ---------------------------------------------------------------
# Safety net: the parser found no git invocation, yet git's arguments
# may still arrive from somewhere it cannot see (`… | xargs git push`).
# Gated on an explicit indirection token, so a command that merely
# QUOTES a git line (`echo "git push origin main" >> doc.md`) stays
# silent — that mistake is what BLOCK 2 used to make. For real
# indirection, fall back to the pre-8aafd8eb crude text match: a false
# positive beats a silent hole in an enforcement layer.
# ---------------------------------------------------------------
printf '%s' "$CMD" | grep -qE '(^|[^A-Za-z0-9_.-])(eval|xargs)([^A-Za-z0-9_.-]|$)' || exit 0

OPT='([[:space:]]+-[^[:space:]]*([[:space:]]+[^-[:space:]][^[:space:]]*)?)*'
REPO_ROOT=$( (cd "$SESSION_DIR" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || pwd)
cid=$(repo_id "$REPO_ROOT")
own_id && [ -n "$cid" ] && [ "$cid" != "$OWN_ID" ] && exit 0
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if printf '%s' "$CMD" | grep -qE "\bgit${OPT}[[:space:]]+(commit|merge|cherry-pick|revert)\b" \
   && [ "$BRANCH" = "main" ]; then
  deny "$DENY_MUT"
fi
if printf '%s' "$CMD" | grep -qE "\bgit${OPT}[[:space:]]+push\b"; then
  targets_main=0
  [ "$BRANCH" = "main" ] && targets_main=1
  printf '%s' "$CMD" | grep -E "\bgit${OPT}[[:space:]]+push\b" \
    | grep -qE '(^|[[:space:]:])main([[:space:]]|:|$)' && targets_main=1
  [ "$targets_main" = "1" ] && deny "$DENY_PUSH"
fi

exit 0
