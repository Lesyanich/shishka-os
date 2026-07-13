#!/bin/sh
# ============================================================
# Shishka OS — Git Guard Hook
# Hook event: PreToolUse
# Matcher:    Bash
#
# Enforces RULE-GIT-HYGIENE at the terminal, before the command runs:
#   1. HARD BLOCK — local mutation of `main` (commit / merge /
#                   cherry-pick / revert while on main)
#   2. HARD BLOCK — `git push` targeting `main` (main is PR-only)
#   3. WARN       — off-convention branch name (feature|fix|chore|docs|
#                   refactor|perf|security/...). Fires ONLY while the
#                   branch has no upstream yet: before the first push a
#                   rename is free; after it, renaming breaks the PR,
#                   so silence beats bad advice.
#
# Escape hatch (sanctioned automation ONLY, e.g. the data-health
# sheriff): prefix the command — `SHISHKA_ALLOW_MAIN=1 git commit …`.
# The guard greps the prefix out of the command TEXT (an env var set
# inside the Bash call is invisible to this hook process) and also
# honours it in its own env for cron-configured runners. Deliberately
# NOT advertised in deny messages.
#
# Known limits (this layer stops accidents, not adversaries — the
# server-side GitHub protection is the real fence):
#   - branch is read from the session repo; `cd /elsewhere && git ...`
#     is judged against THIS repo's branch
#   - a single LINE containing both a `git … push` phrase and a bare
#     'main' token can still trip the guard, even inside quotes
#
# Fail-OPEN on infra errors (no stdin, no jq, git errors): we only
# block a PROVEN write to main — never on uncertainty.
# ============================================================

# --- Read hook payload from stdin ---
[ -t 0 ] && exit 0                          # No stdin → not a hook invocation → noop
PAYLOAD=$(cat 2>/dev/null || true)
[ -z "$PAYLOAD" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0     # Fail-open if jq missing

TOOL=$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // empty')
[ "$TOOL" = "Bash" ] || exit 0

CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

# Cheap early-out: only care about commands that invoke git
printf '%s' "$CMD" | grep -qE '(^|[;&|( ])git([ (]|$)' || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}
warn() {
  jq -n --arg ctx "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
  exit 0
}

# Verb detection in SUBCOMMAND position: `git [options] <verb>`.
# OPT eats leading `-x`/`--xx` tokens, each optionally followed by ONE
# non-dash argument (covers `-C <dir>`, `-c k=v`, `--no-pager`), so
# `git -C /x push` matches while `git log --grep push` does not.
OPT='([[:space:]]+-[^[:space:]]*([[:space:]]+[^-[:space:]][^[:space:]]*)?)*'
is_mut=0; is_push=0
printf '%s' "$CMD" | grep -qE "\bgit${OPT}[[:space:]]+(commit|merge|cherry-pick|revert)\b" && is_mut=1
printf '%s' "$CMD" | grep -qE "\bgit${OPT}[[:space:]]+push\b" && is_push=1
[ "$is_mut" = "0" ] && [ "$is_push" = "0" ] && exit 0

# Escape hatch: command-text prefix (the real path — env vars inside the
# Bash call never reach this process) or hook env (cron runners).
SKIP_MAIN=0
[ "${SHISHKA_ALLOW_MAIN:-}" = "1" ] && SKIP_MAIN=1
printf '%s' "$CMD" | grep -q 'SHISHKA_ALLOW_MAIN=1' && SKIP_MAIN=1

# ---- BLOCK 1: local mutation of main ----
if [ "$SKIP_MAIN" = "0" ] && [ "$is_mut" = "1" ] && [ "$BRANCH" = "main" ]; then
  deny "RULE-GIT-HYGIENE — refusing to modify 'main' locally (commit/merge/cherry-pick/revert). main is PR-only. Move the work to a branch:
  git checkout -b feature/{project}/{description}
  (project = admin|web|app|agents|security|tooling|docs|cleanup)
then commit there and open a PR. If this is sanctioned automation, its runbook documents the bypass (see RULE-GIT-HYGIENE)."
fi

# ---- BLOCK 2: push to main ----
if [ "$SKIP_MAIN" = "0" ] && [ "$is_push" = "1" ]; then
  targets_main=0
  [ "$BRANCH" = "main" ] && targets_main=1
  # explicit main ref token — scanned ONLY on lines that contain the push
  # invocation itself, so a multi-line commit message mentioning a
  # `git … push` example on one line and 'main' on another does not trip
  # (that exact false positive fired while committing this guard's fixes)
  printf '%s' "$CMD" | grep -E "\bgit${OPT}[[:space:]]+push\b" | grep -qE '(^|[[:space:]:])main([[:space:]]|:|$)' && targets_main=1
  if [ "$targets_main" = "1" ]; then
    deny "RULE-GIT-HYGIENE — refusing to PUSH to 'main'. main ships to production and is PR-only. Push a feature branch instead:
  git push -u origin feature/{project}/{description}
and open a Pull Request. If this is sanctioned automation, its runbook documents the bypass (see RULE-GIT-HYGIENE)."
  fi
fi

# ---- WARN 3: off-convention branch name (only before first push) ----
if [ "$is_mut" = "1" ] && [ -n "$BRANCH" ] && [ "$BRANCH" != "main" ]; then
  case "$BRANCH" in
    feature/*|fix/*|chore/*|docs/*|refactor/*|perf/*|security/*) : ;;   # conforms → silent
    *)
      # Upstream already set → branch is pushed (PR likely exists);
      # renaming now would break it. Stay silent instead of nagging.
      if ! git -C "$REPO_ROOT" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
        warn "RULE-GIT-HYGIENE — branch '$BRANCH' is off-convention. Preferred: feature/{project}/{description} (or fix|chore|docs|refactor|perf|security/...). Auto-generated 'claude/*' names carry no meaning. Rename NOW, while nothing is pushed:
  git branch -m feature/{project}/{description}"
      fi
      ;;
  esac
fi

exit 0
