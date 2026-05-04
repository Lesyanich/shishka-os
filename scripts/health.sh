#!/bin/sh
# ============================================================
# Shishka OS — /health command (CEO observability)
#
# Single command that surfaces "is the system healthy right now?"
# Output: Russian, human-readable, no technical IDs.
#
# Sections:
#   - Сейчас (active MC task, branch, last commit, dirty tree)
#   - Память (memory file count, last update, stale count >60d)
#   - Качество данных (v_data_health: errors, warnings, score)
#   - Самообучение (correction_rules + supplier_aliases counts)
#   - Параллельные сессии (other in_progress MC tasks)
#
# Sources of truth:
#   - Memory: $HOME/.claude/projects/<encoded>/memory/*.md
#   - MC: business_tasks via Supabase REST API
#   - Data Health: v_data_health view
#   - Learning: correction_rules + supplier_aliases tables
#
# Usage:
#   bash scripts/health.sh           — print to stdout
#   bash scripts/health.sh --json    — emit JSON for slash command
#
# Spec: WS-5 of Shishka OS Brain Reorganization (MC: 0cc53ea6)
# ============================================================

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

JSON_OUTPUT=false
if [ "${1:-}" = "--json" ]; then
  JSON_OUTPUT=true
fi

SUPABASE_URL="https://qcqgtcsjoacuktcewpvo.supabase.co"
SERVICE_KEY=$(security find-generic-password -s "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null || true)

# ----------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------

# Human-readable relative time from epoch seconds (Russian)
human_ago() {
  ts="$1"
  [ -z "$ts" ] && { printf -- "—"; return; }
  now=$(date +%s)
  diff=$(( now - ts ))
  if [ "$diff" -lt 60 ]; then
    printf "только что"
  elif [ "$diff" -lt 3600 ]; then
    mins=$(( diff / 60 ))
    printf "%d мин назад" "$mins"
  elif [ "$diff" -lt 86400 ]; then
    hrs=$(( diff / 3600 ))
    printf "%d ч назад" "$hrs"
  elif [ "$diff" -lt 2592000 ]; then
    days=$(( diff / 86400 ))
    printf "%d дн назад" "$days"
  else
    months=$(( diff / 2592000 ))
    printf "%d мес назад" "$months"
  fi
}

# File mtime → epoch (cross-platform)
mtime_epoch() {
  if [ "$(uname)" = "Darwin" ]; then
    stat -f %m "$1" 2>/dev/null || echo 0
  else
    stat -c %Y "$1" 2>/dev/null || echo 0
  fi
}

# Locate memory dir for the current project (Claude Code encodes the
# main repo path; we glob $HOME/.claude/projects/* matching "hishka").
find_memory_dir() {
  found=""
  for d in "$HOME"/.claude/projects/*hishka*/memory "$HOME"/.claude/projects/*Shishka*/memory; do
    [ -d "$d" ] || continue
    found="$d"
    break
  done
  printf '%s' "$found"
}

# Supabase REST GET (returns body or empty on failure)
sb_get() {
  path="$1"
  [ -z "$SERVICE_KEY" ] && { printf ''; return; }
  curl -fsS --max-time 5 \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    "$SUPABASE_URL/rest/v1/$path" 2>/dev/null || true
}

# ----------------------------------------------------------------
# Section: Сейчас
# ----------------------------------------------------------------

BRANCH=$(git branch --show-current 2>/dev/null || echo "—")
LAST_COMMIT_TS=$(git log -1 --format=%ct 2>/dev/null || echo 0)
LAST_COMMIT_MSG=$(git log -1 --format=%s 2>/dev/null | head -c 60 || echo "—")
DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
SESSION_ID=$(cat "$REPO_ROOT/.claude/.session-id" 2>/dev/null || echo "—")

# Active MC task: in_progress claimed by current session
ACTIVE_TITLE="—"
ACTIVE_PHASE="—"
if [ -n "$SERVICE_KEY" ]; then
  ACTIVE_RAW=$(sb_get "business_tasks?status=eq.in_progress&select=title,related_ids&order=updated_at.desc&limit=20")
  if [ -n "$ACTIVE_RAW" ] && command -v jq >/dev/null 2>&1; then
    MINE=$(printf '%s' "$ACTIVE_RAW" | jq -r --arg me "$SESSION_ID" '
      [.[] | select(.related_ids.claimed_by == $me)] | first // null
    ')
    if [ -n "$MINE" ] && [ "$MINE" != "null" ]; then
      ACTIVE_TITLE=$(printf '%s' "$MINE" | jq -r '.title // "—" | if length > 68 then .[:67] + "…" else . end')
      ACTIVE_PHASE=$(printf '%s' "$MINE" | jq -r '.related_ids.phase // "—"')
    fi
  fi
fi

# ----------------------------------------------------------------
# Section: Память
# ----------------------------------------------------------------

MEM_DIR=$(find_memory_dir)
MEM_COUNT=0
MEM_STALE_60=0
MEM_LAST_UPDATE_TS=0

if [ -n "$MEM_DIR" ] && [ -d "$MEM_DIR" ]; then
  for f in "$MEM_DIR"/*.md; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    [ "$bn" = "MEMORY.md" ] && continue
    MEM_COUNT=$(( MEM_COUNT + 1 ))
    ts=$(mtime_epoch "$f")
    [ "$ts" -gt "$MEM_LAST_UPDATE_TS" ] && MEM_LAST_UPDATE_TS=$ts
    age_days=$(( ( $(date +%s) - ts ) / 86400 ))
    [ "$age_days" -gt 60 ] && MEM_STALE_60=$(( MEM_STALE_60 + 1 ))
  done
fi

# ----------------------------------------------------------------
# Section: Качество данных (v_data_health)
# ----------------------------------------------------------------

DH_ERRORS=0
DH_WARNINGS=0
DH_ACTIONS=0
DH_SCORE="—"
DH_SCORE_RAW=""
DH_AVAILABLE=false

if [ -n "$SERVICE_KEY" ] && command -v jq >/dev/null 2>&1; then
  DH_RAW=$(sb_get "v_data_health?select=metric,severity,val,health_score")
  if [ -n "$DH_RAW" ] && [ "$DH_RAW" != "[]" ]; then
    DH_AVAILABLE=true
    DH_ERRORS=$(printf '%s' "$DH_RAW" | jq '[.[] | select(.severity == "error") | .val] | add // 0')
    DH_WARNINGS=$(printf '%s' "$DH_RAW" | jq '[.[] | select(.severity == "warning") | .val] | add // 0')
    DH_ACTIONS=$(printf '%s' "$DH_RAW" | jq '[.[] | select(.severity == "action") | .val] | add // 0')
    DH_SCORE_RAW=$(printf '%s' "$DH_RAW" | jq -r '.[0].health_score // "—"')
    # Validate score: clamp to 0-100 range. Out-of-range => "—" + flag.
    DH_SCORE="$DH_SCORE_RAW"
    if printf '%s' "$DH_SCORE_RAW" | grep -Eq '^-?[0-9]+(\.[0-9]+)?$'; then
      score_int=$(printf "%.0f" "$DH_SCORE_RAW" 2>/dev/null || echo "")
      if [ -n "$score_int" ] && [ "$score_int" -ge 0 ] && [ "$score_int" -le 100 ]; then
        DH_SCORE="${score_int}%"
      else
        DH_SCORE="— (формула сломана, raw=$DH_SCORE_RAW)"
      fi
    fi
  fi
fi

# ----------------------------------------------------------------
# Section: Самообучение (correction_rules + supplier_aliases)
# ----------------------------------------------------------------

LEARN_RULES="—"
LEARN_ALIASES="—"
LEARN_CATEGORIES="—"

if [ -n "$SERVICE_KEY" ]; then
  # HEAD with Prefer:count=exact returns Content-Range header with total
  count_table() {
    table="$1"
    [ -z "$SERVICE_KEY" ] && { printf -- "—"; return; }
    range=$(curl -fsSI --max-time 5 \
      -H "apikey: $SERVICE_KEY" \
      -H "Authorization: Bearer $SERVICE_KEY" \
      -H "Prefer: count=exact" \
      "$SUPABASE_URL/rest/v1/$table?select=*" 2>/dev/null \
      | awk -F'/' '/[Cc]ontent-[Rr]ange:/ {gsub("\r","",$2); print $2}')
    if [ -n "$range" ] && [ "$range" != "*" ]; then
      printf '%s' "$range"
    else
      printf -- "—"
    fi
  }
  LEARN_RULES=$(count_table "correction_rules")
  LEARN_ALIASES=$(count_table "supplier_aliases")
  LEARN_CATEGORIES=$(count_table "category_overrides")
fi

# ----------------------------------------------------------------
# Section: Параллельные сессии
# ----------------------------------------------------------------

PARALLEL_LINES=""
PARALLEL_COUNT=0
if [ -n "$SERVICE_KEY" ] && command -v jq >/dev/null 2>&1 && [ -n "$ACTIVE_RAW" ]; then
  PARALLEL_LINES=$(printf '%s' "$ACTIVE_RAW" | jq -r --arg me "$SESSION_ID" '
    [.[] | select(.related_ids.claimed_by != null and .related_ids.claimed_by != "—" and .related_ids.claimed_by != $me)]
    | map("  ⚠ " + (.title[:55]) + "  · " + (.related_ids.phase // "—"))
    | join("\n")
  ' 2>/dev/null)
  PARALLEL_COUNT=$(printf '%s' "$ACTIVE_RAW" | jq -r --arg me "$SESSION_ID" '
    [.[] | select(.related_ids.claimed_by != null and .related_ids.claimed_by != "—" and .related_ids.claimed_by != $me)] | length
  ' 2>/dev/null || echo 0)
fi

# ----------------------------------------------------------------
# Render
# ----------------------------------------------------------------

NOW_DATE=$(date "+%Y-%m-%d %H:%M")

# Format numbers with safe defaults
[ -z "$DH_ERRORS" ] || [ "$DH_ERRORS" = "null" ] && DH_ERRORS=0
[ -z "$DH_WARNINGS" ] || [ "$DH_WARNINGS" = "null" ] && DH_WARNINGS=0

# Stale memory verdict
if [ "$MEM_COUNT" -eq 0 ]; then
  MEM_VERDICT="директория памяти не найдена"
elif [ "$MEM_STALE_60" -eq 0 ]; then
  MEM_VERDICT="чисто"
else
  pct=$(( MEM_STALE_60 * 100 / MEM_COUNT ))
  if [ "$pct" -ge 30 ]; then
    MEM_VERDICT="нужна ревизия (см. WS-2)"
  else
    MEM_VERDICT="нормально"
  fi
fi

# Data Health verdict
if [ "$DH_AVAILABLE" = "false" ]; then
  DH_VERDICT="недоступно (нет ключа Supabase или таблицы)"
else
  DH_VERDICT="$DH_ERRORS ошибок · $DH_WARNINGS предупреждений · $DH_ACTIONS к действию · health-score $DH_SCORE"
fi

if [ "$JSON_OUTPUT" = "true" ] && command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg now "$NOW_DATE" \
    --arg branch "$BRANCH" \
    --arg session "$SESSION_ID" \
    --arg active_title "$ACTIVE_TITLE" \
    --arg active_phase "$ACTIVE_PHASE" \
    --arg last_commit_ago "$(human_ago "$LAST_COMMIT_TS")" \
    --arg last_commit_msg "$LAST_COMMIT_MSG" \
    --arg dirty "$DIRTY_COUNT" \
    --arg mem_count "$MEM_COUNT" \
    --arg mem_stale "$MEM_STALE_60" \
    --arg mem_last_ago "$(human_ago "$MEM_LAST_UPDATE_TS")" \
    --arg mem_verdict "$MEM_VERDICT" \
    --arg dh_score "$DH_SCORE" \
    --arg dh_score_raw "$DH_SCORE_RAW" \
    --arg dh_errors "$DH_ERRORS" \
    --arg dh_warnings "$DH_WARNINGS" \
    --arg dh_actions "$DH_ACTIONS" \
    --arg dh_verdict "$DH_VERDICT" \
    --arg learn_rules "$LEARN_RULES" \
    --arg learn_aliases "$LEARN_ALIASES" \
    --arg learn_categories "$LEARN_CATEGORIES" \
    --arg parallel_count "$PARALLEL_COUNT" \
    --arg parallel_lines "$PARALLEL_LINES" \
    '{
      now: $now,
      branch: $branch,
      session: $session,
      active: { title: $active_title, phase: $active_phase },
      git: { last_commit_ago: $last_commit_ago, last_commit_msg: $last_commit_msg, dirty: ($dirty|tonumber) },
      memory: {
        count: ($mem_count|tonumber),
        stale_60d: ($mem_stale|tonumber),
        last_update_ago: $mem_last_ago,
        verdict: $mem_verdict
      },
      data_health: {
        score: $dh_score,
        score_raw: $dh_score_raw,
        errors: ($dh_errors|tonumber),
        warnings: ($dh_warnings|tonumber),
        actions: ($dh_actions|tonumber),
        verdict: $dh_verdict
      },
      learning: {
        ocr_rules: $learn_rules,
        supplier_aliases: $learn_aliases,
        category_overrides: $learn_categories
      },
      parallel: {
        count: ($parallel_count|tonumber),
        sessions_text: $parallel_lines
      }
    }'
  exit 0
fi

cat <<EOF
═══════════════════════════════════════════════════
  Шишка ОС — Здоровье системы
  $NOW_DATE  ·  ветка $BRANCH
═══════════════════════════════════════════════════

📍 Сейчас
  Активная задача:  $ACTIVE_TITLE
  Фаза:             $ACTIVE_PHASE
  Сессия:           $SESSION_ID
  Последний коммит: $(human_ago "$LAST_COMMIT_TS")  ·  $LAST_COMMIT_MSG
  Изменений в коде: $DIRTY_COUNT файл(ов)

🧠 Память ($MEM_COUNT записей)
  Последнее обновление: $(human_ago "$MEM_LAST_UPDATE_TS")
  Старше 60 дней:       $MEM_STALE_60 запис(ей)
  Статус:               $MEM_VERDICT

🩺 Качество данных
  $DH_VERDICT

🤖 Самообучение
  Правил OCR:           $LEARN_RULES
  Алиасов поставщиков:  $LEARN_ALIASES
  Категорийных правок:  $LEARN_CATEGORIES
  (метрики авто/ручных корректировок появятся после WS-4)

🚦 Параллельные сессии ($PARALLEL_COUNT)
EOF

if [ "$PARALLEL_COUNT" -gt 0 ] && [ -n "$PARALLEL_LINES" ]; then
  printf '%s\n' "$PARALLEL_LINES"
else
  echo "  (других сессий не видно)"
fi

cat <<EOF

═══════════════════════════════════════════════════
EOF
