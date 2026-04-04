# Spec: Receipt Inbox Management — UI Improvements

> **Author:** COO (Cowork)
> **Date:** 2026-04-04
> **For:** Admin Panel Dev (Claude Code)
> **Priority:** HIGH — блокирует ежедневную работу с чеками

---

## 1. Контекст

Receipt inbox (`receipt_inbox` table) — входная точка для всех чеков. Фото загружается через Telegram бот или admin panel, Finance Agent парсит чек и сохраняет `parsed_payload`, Леся ревьюит и аппрувит через admin panel.

Текущие проблемы:
- В списке чеков поставщик и сумма показывают прочерки (берутся из `supplier_hint`/`amount_hint`, а не из `parsed_payload`)
- Нет кнопки удаления чека
- Нет кнопки редактирования содержимого чека
- Медленная загрузка фото (~1 минута) — слишком большие файлы
- Тестовый чек от 02.04 невозможно удалить (нет RLS policy на DELETE, нет RPC)

## 2. Existing code (worktree reference)

В worktree `great-swartz` (`03_Development/`) уже есть частичная реализация. Код можно использовать как reference, но нужно адаптировать под основную структуру проекта (`apps/admin-panel/`, `services/supabase/`).

Файлы в worktree:
```
.claude/worktrees/great-swartz/03_Development/
├── supabase/migrations/092_inbox_management.sql    — RPC для delete + sync
├── admin-panel/src/hooks/useReceiptInbox.ts        — hook с delete, approve, sync
├── admin-panel/src/components/receipts/
│   ├── InboxList.tsx                                — таблица с parsed data
│   └── InboxReviewPanel.tsx                         — панель ревью/аппрува
```

**Качество кода:** ревью пройден COO. Логика корректная, RPC безопасные. Нужна адаптация путей и доработки (см. ниже).

## 3. Задачи

### 3.1 Migration: Delete RPC + Status Sync

**Файл:** `services/supabase/migrations/092_inbox_management.sql`

Создать две RPC функции:

**`fn_delete_inbox_row(p_inbox_id UUID)`**
- SECURITY DEFINER (обход RLS)
- Запретить удаление если `expense_id IS NOT NULL`
- Вернуть `{ok: true/false, error?}`
- Reference: worktree `great-swartz` → `092_inbox_management.sql`

**`fn_sync_inbox_status(p_inbox_id UUID)`**
- Если `expense_id IS NOT NULL` и `status != 'processed'` → автоисправление
- Вернуть `{ok, fixed, old_status?, new_status?}`

GRANT EXECUTE TO authenticated, anon.

### 3.2 Hook: useReceiptInbox — дополнить

**Файл:** `apps/admin-panel/src/hooks/useReceiptInbox.ts`

Добавить (если ещё нет):
- `deleteRow(inboxId)` → вызов `fn_delete_inbox_row` RPC
- `syncStatus(inboxId)` → вызов `fn_sync_inbox_status` RPC
- Тип `InboxRow` должен включать `parsed_payload: Record<string, unknown> | null`

Reference: worktree hook полностью покрывает эти требования.

### 3.3 InboxList: показ parsed data + кнопка удаления

**Файл:** `apps/admin-panel/src/components/receipts/InboxList.tsx`

1. **Поставщик:** показывать `parsed_payload.supplier_name` если `supplier_hint` пустой
2. **Сумма:** показывать `parsed_payload.amount_original` если `amount_hint` пустой
3. **Кнопка удаления:** иконка Trash2, с confirm dialog. Скрыть если `expense_id` есть (чек уже привязан).
4. **Статус "parsed":** добавить бейдж (фиолетовый/индиго) "Ревью"

### 3.4 Edit Modal: редактирование чека

**Новый файл:** `apps/admin-panel/src/components/receipts/InboxEditModal.tsx`

Модальное окно для редактирования полей inbox-записи:
- `supplier_hint` — text input
- `amount_hint` — number input
- `receipt_date` — date picker
- `notes` — textarea
- Если `parsed_payload` есть — показать JSON в readonly блоке (collapsible)
- Сохранение через `supabase.from('receipt_inbox').update({...}).eq('id', inboxId)`
- Кнопка открытия: иконка Pencil в строке таблицы

### 3.5 Upload optimization: resize перед отправкой

**Файл:** `apps/admin-panel/src/components/receipts/InboxUploader.tsx`

Перед загрузкой в Supabase Storage:
1. Resize изображение до max 2048px по большей стороне (Canvas API)
2. Compress в WebP, quality 0.65
3. Добавить визуальный прогресс (даже простой spinner с текстом "Сжатие..." → "Загрузка...")

Ожидаемый результат: файл ~200-400KB вместо 5-15MB, upload за 5-15 секунд вместо минуты.

## 4. Приёмка

- [ ] Тестовый чек от 02.04 удаляется через UI
- [ ] Новый чек загружается быстрее (< 15 сек на хорошем WiFi)
- [ ] После парсинга агентом — поставщик и сумма отображаются в списке
- [ ] Чек можно отредактировать (supplier_hint, amount, date, notes)
- [ ] Build проходит без ошибок (`npm run build`)

## 5. Не в scope

- Approve workflow (InboxReviewPanel) — уже реализован в worktree, но это отдельная задача
- RLS policies для authenticated-only — пока нет аутентификации
- Realtime subscriptions — в будущем
