# Session Handoff Protocol v1.0

> Дополнение к `agent-tracking.md`. Определяет как агенты открывают, закрывают сессии
> и передают работу между сессиями и между инструментами (Cowork ↔ Code).

## Проблема

Без формального протокола:
- Следующая сессия того же агента не знает, где остановилась предыдущая
- Cowork создаёт спеку, Code выполняет — но результат не связан с задачей MC
- Леся не видит цепочку: кто начал → кто сделал → что получилось

## Принцип: MC Task = единица передачи

**Mission Control task — это контракт между сессиями.**
Всё что нужно передать другой сессии или другому инструменту — привязывается к MC task через `related_ids`.

---

## 1. Session Open (все агенты)

При старте сессии, **до любой работы**:

```
1. Загрузить контекст по AGENT.md (domain files, preferences, etc.)
2. list_tasks(status="in_progress") → есть ли задачи, которые я начал ранее?
3. list_tasks(status="inbox") → есть ли новые задачи для моего домена?
4. Прочитать session-log.md → последняя запись = точка остановки предыдущей сессии
```

Если найдена `in_progress` задача — **продолжить её**, а не начинать новую.

## 2. Session Close (все агенты)

Перед завершением сессии:

```
1. Обновить все задачи MC, над которыми работал:
   - Если завершил → update_task(status="done", description="результат")
   - Если не завершил → update_task(notes="где остановился, что осталось")

2. Записать Session Footer в session-log.md:
   ---
   ### Session Close: {date} {time}
   **Worked on:** task_id_1, task_id_2
   **Status:** {done | partial | blocked}
   **Handoff:** {что нужно подхватить следующей сессии, или "none"}
   ---

3. Если есть работа для другого инструмента → создать Handoff Task (см. секцию 4)
```

## 3. `related_ids` — стандартные ключи для связывания

Расширение таблицы из `agent-tracking.md`:

| Ключ | Тип | Описание |
|------|-----|----------|
| `agent_session` | string (ISO) | Timestamp начала сессии, в которой создана задача |
| `spec_file` | string (path) | Путь к спеке в репозитории (`docs/plans/...`) |
| `parent_session` | string (ISO) | Timestamp сессии, которая породила эту задачу |
| `completed_by` | string | Кто выполнил: `cowork`, `code`, `chef-agent`, `finance-agent` |
| `completion_commit` | string | Git commit hash результата (для Code) |
| `nomenclature_id` | string (UUID) | ID продукта (для Chef) |
| `expense_id` | string (UUID) | ID расхода (для Finance) |
| `inbox_id` | string (UUID) | ID записи в inbox |

## 4. Handoff между инструментами

### 4a. Cowork → Code (спека → реализация)

```
Cowork:
1. Написать спеку: docs/plans/{name}-spec.md
2. Создать или обновить MC task:
   emit_business_task(
     title: "Implement: {feature}",
     domain: "tech",
     status: "inbox",
     related_ids: {
       spec_file: "docs/plans/{name}-spec.md",
       agent_session: "{ISO timestamp}"
     }
   )
3. Сообщить Лесе: "Спека готова, task #{id} в MC. Запускай Code."

Code:
1. list_tasks(status="inbox", domain="tech") → найти задачу
2. Прочитать spec_file из related_ids
3. update_task(status="in_progress")
4. Выполнить работу
5. update_task(
     status="done",
     description="Результат: {summary}",
     notes=null,
     related_ids добавить: {
       completed_by: "code",
       completion_commit: "{hash}"
     }
   )
6. Вернуть отчёт Лесе
```

### 4b. Code → Cowork (результат → следующий шаг)

```
Code (в конце работы):
1. Если нужно архитектурное решение → создать MC task:
   emit_business_task(
     title: "Design: {что нужно решить}",
     domain: "tech" или "kitchen",
     status: "inbox",
     related_ids: {
       parent_session: "{ISO}",
       completion_commit: "{last commit hash}"
     }
   )

Cowork (при старте):
1. list_tasks(status="inbox") → увидит задачу от Code
2. Подхватить и продолжить
```

### 4c. Агент → Агент (Chef → Finance, etc.)

```
Chef Agent:
1. Обнаружил проблему вне своего scope
2. emit_business_task(
     title: "Cost anomaly: RAW-SALMON +15%",
     domain: "finance",        ← domain определяет получателя
     created_by: "chef-agent",
     related_ids: {
       nomenclature_id: "{uuid}",
       agent_session: "{ISO}"
     }
   )

Finance Agent (при старте):
1. list_tasks(domain="finance", status="inbox") → видит задачу от Chef
2. Берёт в работу
```

## 5. Session Identity

**Session ID = ISO timestamp начала сессии.**

Формат: `2026-04-04T14:30:00` (без timezone, local time).

Записывается в:
- `session-log.md` как заголовок: `## 2026-04-04 14:30 — {title}`
- `related_ids.agent_session` при создании задач
- `related_ids.parent_session` при создании дочерних задач

Почему не UUID: timestamp читаем для человека, достаточно уникален для одного агента, легко соотносится с session-log.md.

## 6. Git State Protocol

### При старте любой сессии
```
1. Проверить текущую ветку: git branch --show-current
2. Проверить незакоммиченные изменения: git status -s
3. Если есть uncommitted changes → ПРЕДУПРЕДИТЬ CEO:
   "На ветке {branch} есть незакоммиченные изменения: {N файлов}.
    Закоммитить как WIP перед началом работы?"
4. Записать ветку в session-log: "[HH:MM] branch: {name}, status: clean|dirty"
```

### Перед любым коммитом
```
1. Проверить что мы на правильной ветке для данной задачи
2. Если ветка не соответствует задаче → ОСТАНОВИТЬСЯ, спросить CEO
3. Никогда не переключать ветку при наличии uncommitted changes
```

### Перед переключением ветки
```
1. git status → если dirty: "Закоммитить WIP? (да/нет)"
2. Только после чистого состояния → git checkout {branch}
3. Записать в session-log: "[HH:MM] branch switch: {old} → {new}"
```

## 7. Правила

1. **Никогда не бросай in_progress задачу.** При завершении сессии — либо `done`, либо записать в `notes` где остановился.
2. **spec_file обязателен** для задач типа "Implement X". Без спеки Code не может начать работу.
3. **completed_by обязателен** при закрытии задачи как done. Леся должна видеть кто сделал.
4. **Один инструмент — один update.** Не перезаписывай related_ids от предыдущего инструмента, добавляй свои ключи.
5. **Session Footer — последняя запись.** В session-log.md footer всегда внизу, после всех пошаговых записей.
6. **Cowork НИКОГДА не даёт CEO терминальные команды.** Любая работа с git, deploy, build — это MC задача для Code. Cowork создаёт задачу, Code выполняет. Без исключений.
7. **Git branch в related_ids обязателен** для любой задачи, связанной с кодом. Code должен знать на какой ветке работать.

## 8. Диаграмма потока

```
┌──────────┐    spec_file     ┌──────────┐
│  Cowork  │ ──── MC task ──→ │   Code   │
│  (COO)   │ ← done+commit ── │(terminal)│
└──────────┘                   └──────────┘
     │                              │
     │  emit_business_task          │  update_task
     ▼                              ▼
┌─────────────────────────────────────────┐
│         Mission Control (Supabase)       │
│         business_tasks table             │
└─────────────────────────────────────────┘
     ▲                              ▲
     │  list_tasks                  │  emit/update
     │                              │
┌──────────┐                  ┌──────────┐
│   Chef   │ ── cross-domain →│ Finance  │
│  Agent   │    MC task        │  Agent   │
└──────────┘                  └──────────┘
```

## Интеграция

- Этот протокол **дополняет** `agent-tracking.md` (Tier 1/Tier 2 остаётся)
- Каждый AGENT.md должен ссылаться на этот файл в секции Context Loading
- `_template/AGENT.md` обновить: добавить пункт в Tracking Protocol
