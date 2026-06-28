#!/bin/sh
# ============================================================
# Skill Advisor — acceptance stats (P4)
# Reads the learning log (.claude/.skill-advisor-log.jsonl) and
# reports, per tool: how often the 💡 advisor suggested it vs how
# often it was actually used later in the SAME session ("accepted").
#
# A suggestion counts as accepted if the suggested tool was invoked
# (skill / slash-command / MCP) in the same session at-or-after the
# suggestion timestamp. Tool ↔ usage matching is token-based.
#
# Read-only. Pure shell + jq + awk. Run: /skills-stats
# ============================================================

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" 2>/dev/null || exit 0
command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 0; }
LOG=".claude/.skill-advisor-log.jsonl"
if [ ! -s "$LOG" ]; then
  echo "No learning data yet ($LOG is empty)."
  echo "The 💡 hook logs suggestions and the PostToolUse hook logs tool usage —"
  echo "stats appear once you've worked a few sessions with the advisor active."
  exit 0
fi

# Flatten JSONL → TSV stream for awk:
#   S <session> <ts> <tool>          (one row per suggested tool)
#   U <session> <ts> <id> <toolname> (one row per tool use)
FLAT=$(jq -rc '
  if .kind=="suggest" then
    (.session) as $s | (.ts|tostring) as $t | (.tools // [])[] | ["S",$s,$t,.] | @tsv
  elif .kind=="use" then
    ["U", .session, (.ts|tostring), (.id // ""), (.tool // "")] | @tsv
  else empty end
' "$LOG" 2>/dev/null)

[ -n "$FLAT" ] || { echo "No usable log rows."; exit 0; }

printf '%s\n' "$FLAT" | awk -F'\t' '
  BEGIN {
    MINLEN = 3
    STOP = " mcp shishka agent skill slash command the and for "
  }
  # token-match: does any meaningful token of the registry tool appear in the use id/name?
  function matches(regtool, hay,   rt, n, a, i, tok) {
    rt = tolower(regtool); hay = tolower(hay)
    gsub(/[^a-z0-9]+/, " ", rt)
    n = split(rt, a, " ")
    for (i = 1; i <= n; i++) {
      tok = a[i]
      if (length(tok) < MINLEN) continue
      if (index(STOP, " " tok " ") > 0) continue
      if (index(hay, tok) > 0) return 1
    }
    return 0
  }
  # Pass 1: just collect events (uses can appear after suggests in the log)
  $1 == "U" {
    s = $2; n = ++uc[s]
    uts[s, n] = $3 + 0; uid[s, n] = $4; utool[s, n] = $5
    next
  }
  $1 == "S" {
    ns++
    ssess[ns] = $2; sts[ns] = $3 + 0; stool[ns] = $4
    next
  }
  END {
    # Pass 2: correlate each suggestion against same-session later uses
    for (k = 1; k <= ns; k++) {
      tool = stool[k]; s = ssess[k]; ts = sts[k]
      suggested[tool]++
      found = 0; m = uc[s]
      for (j = 1; j <= m; j++) {
        if (uts[s, j] < ts) continue
        if (matches(tool, uid[s, j]) || matches(tool, utool[s, j])) { found = 1; break }
      }
      if (found) accepted[tool]++
    }

    print "=== Skill Advisor — acceptance stats ==="
    print ""
    printf "%-26s %9s %9s %7s\n", "tool", "suggested", "accepted", "rate"
    printf "%-26s %9s %9s %7s\n", "----", "---------", "--------", "----"
    # sort tools by suggested desc (simple insertion into ordered list)
    nt = 0
    for (t in suggested) { keys[++nt] = t }
    for (a = 1; a <= nt; a++) for (b = a + 1; b <= nt; b++)
      if (suggested[keys[b]] > suggested[keys[a]]) { tmp = keys[a]; keys[a] = keys[b]; keys[b] = tmp }
    tot_s = 0; tot_a = 0
    for (a = 1; a <= nt; a++) {
      t = keys[a]; s = suggested[t]; ac = accepted[t] + 0
      r = (s > 0) ? int(ac * 100 / s + 0.5) : 0
      disp = t; gsub(/`/, "", disp)
      printf "%-26s %9d %9d %6d%%\n", disp, s, ac, r
      tot_s += s; tot_a += ac
    }
    print ""
    tr = (tot_s > 0) ? int(tot_a * 100 / tot_s + 0.5) : 0
    printf "TOTAL: %d suggestions, %d accepted (%d%%)\n", tot_s, tot_a, tr
    print ""
    print "Tuning hints (human-in-the-loop — confirm before editing ADVISOR-MAP):"
    flagged = 0
    for (a = 1; a <= nt; a++) {
      t = keys[a]; s = suggested[t]; ac = accepted[t] + 0
      r = (s > 0) ? int(ac * 100 / s + 0.5) : 0
      disp = t; gsub(/`/, "", disp)
      if (s >= 5 && r < 25) { printf "  ⚠ %-22s noisy? %d suggested, only %d%% used → consider narrowing its keywords\n", disp, s, r; flagged++ }
      else if (s >= 5 && r >= 70) { printf "  ✅ %-22s strong (%d%%) → keep / could add more keywords\n", disp, r; flagged++ }
    }
    if (!flagged) print "  (not enough data yet — need ≥5 suggestions per tool to judge)"
  }
'
