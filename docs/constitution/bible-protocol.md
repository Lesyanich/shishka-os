# Bible Protocol — Knowledge Management Rules

> **Priority**: Constitution-level rule. All agents must follow.
> **Created**: 2026-04-05
> **Owner**: CEO (Леся) — единственный, кто авторизует изменения в библии.

## 1. What is the Bible?

`docs/bible/` — каноническая база бизнес-знаний Shishka OS. 9 тематических файлов + INDEX.md маршрутизатор.

Библия содержит **стабильное знание**: бренд, меню, операции, оборудование, цели, бенчмарки. Это не changelog и не task tracker — это "кто мы, что делаем, и почему так".

## 2. Who Can Read

**Все агенты** — через `docs/bible/INDEX.md` → загрузка только своих файлов.

## 3. Who Can Write

**Только COO** (Operating Officer) по прямому указанию CEO.

Агенты, повара, администраторы → создают `field_note` (Supabase) или MC-задачу. COO обрабатывает при триаже. CEO утверждает. COO вносит в библию.

## 4. Input Flows

### Flow A: CEO через Cowork
```
CEO говорит идею/решение/факт → COO классифицирует:
├─ Относится к существующему файлу библии → обновить файл + changelog
├─ Новая тема → обсудить с CEO: расширить существующий файл или создать новый?
└─ Это задача, а не знание → emit_business_task
```

### Flow B: CEO через Mission Control
```
CEO создаёт задачу типа knowledge-update → COO при триаже:
├─ Прочитать задачу
├─ Определить файл библии
├─ Обновить файл
├─ Закрыть задачу
└─ Обновить INDEX.md changelog
```

### Flow C: Полевая разведка (field_notes)
```
Повар/Админ/Агент создаёт field_note (Supabase) → Утренний триаж COO:
├─ Читает новые field_notes (status: new)
├─ Классифицирует:
│   ├─ Ценное знание → обновить библию + status: applied
│   ├─ Требует действия → создать MC-задачу + status: reviewed
│   ├─ Паттерн (3+ похожих заметок) → обобщить в отчёт для CEO
│   └─ Шум → status: dismissed
└─ Доложить CEO: "N новых field_notes. Вот что важно: ..."
```

### Flow D: Агент обнаружил знание
```
Агент в процессе работы обнаружил факт, который должен быть в библии:
├─ НЕ РЕДАКТИРОВАТЬ библию напрямую
├─ Создать Tier 1 задачу: domain=strategy, title="Bible update: {description}"
│   tags: ["bible", "knowledge-update"]
│   related_ids: { bible_file: "docs/bible/{file}.md" }
└─ COO обработает при триаже
```

## 5. Rules

### 5.1 No Direct Agent Edits
Агенты НИКОГДА не редактируют `docs/bible/*.md` напрямую. Даже если уверены что информация верна. Библия — это CEO-approved content.

### 5.2 Changelog Required
Каждое обновление файла библии → запись в `INDEX.md` Change Log:
```
| 2026-04-05 | menu-items.md | Added matcha latte to beverages | CEO |
```

### 5.3 Source Attribution
Каждый факт в библии должен быть отслеживаем. YAML-шапка файла содержит `source` и `updated_by`.

### 5.4 Conflict Resolution
Если библия противоречит данным в Supabase (например, оборудование удалено из БД но есть в equipment.md):
- **Supabase = SSoT для данных** (P0 Rule #1)
- **Библия = SSoT для бизнес-контекста и решений**
- При конфликте: обновить библию, чтобы отражала реальность

### 5.5 Token Economy
Агенты загружают ТОЛЬКО файлы, релевантные текущей задаче. INDEX.md содержит маршрутизацию. Загружать все 9 файлов запрещено — это ~30KB лишних токенов.

## 6. Triage Integration

Morning Triage COO (skill: `morning-triage`) теперь включает шаг:
```
4. Проверить new field_notes → обработать по Flow C
```

## 7. Future: field_notes Table

MC Task: `11fd307b-f550-44e3-8c66-d5e1ad071ba2`
До создания таблицы → агенты используют MC-задачи с тегом `knowledge-update` как временный канал.
