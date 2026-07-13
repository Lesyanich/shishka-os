#!/bin/sh
# ============================================================
# Shishka OS — Git Guard Hook
# Hook event: PreToolUse
# Matcher:    Bash
#
# Enforces RULE-GIT-HYGIENE at the terminal, before the command runs:
#   1. HARD BLOCK — never COMMIT on `main`
#   2. HARD BLOCK — never PUSH to `main` (main is PR-only, ships to prod)
#   3. WARN       — branch name is off-convention (feature|fix|chore|
#                   docs|refactor|perf|security/...). 'claude/*' auto-names
#                   carry no meaning — rename before the first push/PR.
#
# Escape hatch: export SHISHKA_ALLOW_MAIN=1 to bypass the main guard for
# sanctioned automation (e.g. the data-health sheriff report). Never use
# it interactively — it exists so cron jobs are not blocked.
#
# Fail-OPEN on every infra error (no stdin, no jq, git errors). We only
# ever block a PROVEN write to main — never on uncertainty.
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

# Classify the command. The [^;&|"'] run stops at a quote, so a git verb that
# appears only inside a quoted string (a commit message, an echo) is NOT counted
# — that avoids blocking `git commit -m "... push to main ..."`.
is_commit=0; is_push=0
Q="\"'"
if printf '%s' "$CMD" | grep -qE "\bgit\b[^;&|$Q]*\bcommit\b"; then is_commit=1; fi
if printf '%s' "$CMD" | grep -qE "\bgit\b[^;&|$Q]*\bpush\b";   then is_push=1;   fi

# Sanctioned-automation escape hatch
SKIP_MAIN=0
[ "${SHISHKA_ALLOW_MAIN:-}" = "1" ] && SKIP_MAIN=1

# ---- BLOCK 1: commit on main ----
if [ "$SKIP_MAIN" = "0" ] && [ "$is_commit" = "1" ] && [ "$BRANCH" = "main" ]; then
  deny "RULE-GIT-HYGIENE — refusing to COMMIT on 'main'. Never commit directly to main. Create a branch first:
  git checkout -b feature/{project}/{description}
  (project = admin|web|app|agents|security|tooling|docs|cleanup)
Then commit there and open a PR. Sanctioned automation only: re-run with SHISHKA_ALLOW_MAIN=1."
fi

# ---- BLOCK 2: push to main ----
if [ "$SKIP_MAIN" = "0" ] && [ "$is_push" = "1" ]; then
  targets_main=0
  [ "$BRANCH" = "main" ] && targets_main=1
  # explicit main ref token: '... main', '...:main', 'HEAD:main', 'x:main'
  printf '%s' "$CMD" | grep -qE '(^|[[:space:]:])main([[:space:]]|:|$)' && targets_main=1
  if [ "$targets_main" = "1" ]; then
    deny "RULE-GIT-HYGIENE — refusing to PUSH to 'main'. main ships to production and is PR-only. Push a feature branch instead:
  git push -u origin feature/{project}/{description}
and open a Pull Request. Sanctioned automation only: re-run with SHISHKA_ALLOW_MAIN=1."
  fi
fi

# ---- WARN 3: off-convention branch name (checked at commit time) ----
if [ "$is_commit" = "1" ] && [ -n "$BRANCH" ] && [ "$BRANCH" != "main" ]; then
  case "$BRANCH" in
    feature/*|fix/*|chore/*|docs/*|refactor/*|perf/*|security/*) : ;;   # conforms → silent
    *)
      warn "RULE-GIT-HYGIENE — branch '$BRANCH' is off-convention. Preferred: feature/{project}/{description} (or fix|chore|docs|refactor|perf|security/...). Auto-generated 'claude/*' names carry no meaning. It is safe to rename NOW, before the first push/PR:
  git branch -m feature/{project}/{description}"
      ;;
  esac
fi

exit 0
