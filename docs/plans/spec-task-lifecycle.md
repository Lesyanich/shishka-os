# Spec: Task Lifecycle Pipeline

> MC Task: `f89e7f07-8994-4a0d-9ea7-2ef40015d46e`
> Priority: CRITICAL
> Initiative: `a27e85db` (AI-Native Operations)
> Author: COO
> Status: designing

## Problem

Code-агент запускается "голым" — не знает свою задачу, не тестирует автоматически, не создаёт PR, не обновляет MC. Каждая сессия требует ручного промпта от CEO. Handoff-файлы — костыль, который плодит мусор.

## Solution: 3-уровневая система enforcement

```
Уровень 1: Git hooks (Husky)           → НЕЛЬЗЯ обойти (уже работает)
Уровень 2: Claude Code hooks (settings) → АВТОМАТИЧЕСКИ при событиях
Уровень 3: Skill task-lifecycle         → ВЫЗЫВАЕТСЯ агентом для завершения
```

CLAUDE.md остаётся ТОЛЬКО роутером (<80 строк). Все workflow — в hooks и skills.

## Component 1: CLAUDE.md L0 (slim router)

Текущий L0:
```
1. Read core-rules.md
2. Call generate_status → read STATUS.md
3. Read QUEUE.md
```

Новый L0:
```
1. Read core-rules.md
2. Call list_tasks(status="in_progress") — подхвати свою задачу
3. Если in_progress пусто → list_tasks(status="inbox", priority="critical") — предложи CEO
4. Для задачи: читай spec_file + context_files + notes (WIP от предыдущего агента)
5. Ветка: spec_file подскажет, или feature/{project}/description
```

QUEUE.md — УБРАТЬ (deprecated, MC заменяет). STATUS.md — auto-generated, не читать вручную.

## Component 2: .claude/settings.json hooks

### SessionStart hook
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "sh scripts/session-start.sh",
        "timeout": 10000
      }]
    }]
  }
}
```

`scripts/session-start.sh` — lightweight скрипт:
- Печатает текущую ветку + последний коммит
- Напоминает: "Check MC tasks: list_tasks(status='in_progress')"
- НЕ вызывает MCP (hooks не умеют) — только печатает reminder

### PostToolUse hook (auto-test after commit)
```json
{
  "PostToolUse": [{
    "matcher": "Bash",
    "hooks": [{
      "type": "command",
      "command": "sh scripts/post-tool-check.sh",
      "timeout": 15000
    }]
  }]
}
```

`scripts/post-tool-check.sh`:
- Проверяет: последняя команда содержала `git commit`?
- Если да → запускает `npm run build` в apps/admin-panel (если изменения там)
- Если красно → печатает "BUILD FAILED — fix before continuing"
- Агент видит ошибку и чинит

### Permissions
```json
{
  "permissions": {
    "deny": ["Read(./.env)", "Read(./.env.*)"]
  }
}
```

Минимум. Без claude-flow мусора.

## Component 3: Skill `task-lifecycle`

Файл: `.claude/skills/task-lifecycle/SKILL.md`

Тригеры: "task done", "finish task", "create PR", "закончил задачу", "готово"

Skill ведёт агента по чек-листу:
1. Все тесты зелёные? (`npm run build`, `npm run lint`)
2. MC task обновлён? (`update_task` с notes = результат)
3. Ветка запушена? (`git push -u origin branch-name`)
4. PR создан? (`gh pr create --title ... --body ...`)
5. MC task обновлён с PR? (`update_task` с related_ids.pr_number)

## Component 4: Ruflo integration (Phase 2)

НЕ в этой задаче. Ruflo нужен для intra-session multi-agent coordination:
- Разбивка большой задачи на подзадачи
- Параллельные субагенты
- Отдельная MC-задача: `a39304ce`

## Implementation Plan

### Что делает COO (Cowork) — СЕЙЧАС:
1. ✅ Написать skill `.claude/skills/task-lifecycle/SKILL.md`
2. ✅ Написать `scripts/session-start.sh`
3. ✅ Написать `scripts/post-tool-check.sh`
4. ✅ Обновить CLAUDE.md L0 (slim version)

### Что делает Code (PyCharm):
1. Обновить `.claude/settings.json` (добавить hooks)
2. Закоммитить всё на ветку `feature/shared/task-lifecycle`
3. Протестировать: новая сессия → подхватывает задачу из MC?
4. PR + merge

## Success Criteria

- Code-агент при старте АВТОМАТИЧЕСКИ видит свои задачи из MC
- После коммита АВТОМАТИЧЕСКИ прогоняет build/lint
- При завершении задачи — skill ведёт до PR + MC update
- Handoff-файлы НИКОГДА не создаются
- CLAUDE.md < 80 строк (только роутинг)
