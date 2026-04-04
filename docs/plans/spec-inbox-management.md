# Spec: Receipt Inbox Management — восстановление и интеграция

> **MC Task:** `f2d26205` | Priority: CRITICAL
> **Author:** COO (Cowork) | **Date:** 2026-04-04
> **For:** Admin Panel Dev (Claude Code)
> **Branch:** `feature/admin/receipt-review-recovery`

---

## 0. TL;DR для Claude Code

Полная реализация receipt review UI существует в worktree `great-swartz`.
Нужно: перенести 4 файла в main, адаптировать imports, применить миграцию, интегрировать в page.
**Не нужно:** писать с нуля. Код ревьюен COO, логика корректная.

---

## 1. Контекст проблемы

Receipt inbox — входная точка для чеков. Полный workflow:

```
Фото чека → Telegram/Admin Upload → receipt_inbox (pending)
  → Finance Agent парсит → update_inbox(status:"parsed", parsed_payload:{...})
  → Admin Panel: Леся видит детали, редактирует, подтверждает → approve_receipt
  → expense_ledger + purchase_logs (Hub-and-Spoke)
```

**Что сломано:** шаг "Admin Panel: Леся видит детали, редактирует, подтверждает" — отсутствует в main. Код был разработан в worktree `great-swartz` но никогда не замержен. Текущий main имеет урезанный InboxList без expand, без parsed данных, без approve/skip/reopen.

---

## 2. Источники (worktree → main)

| Worktree файл | Целевой путь в main | Действие |
|---|---|---|
| `.claude/worktrees/great-swartz/03_Development/admin-panel/src/hooks/useReceiptInbox.ts` | `apps/admin-panel/src/hooks/useReceiptInbox.ts` | **REPLACE** целиком |
| `.claude/worktrees/great-swartz/03_Development/admin-panel/src/components/receipts/InboxList.tsx` | `apps/admin-panel/src/components/receipts/InboxList.tsx` | **REPLACE** целиком |
| `.claude/worktrees/great-swartz/03_Development/admin-panel/src/components/receipts/InboxReviewPanel.tsx` | `apps/admin-panel/src/components/receipts/InboxReviewPanel.tsx` | **NEW** (создать) |
| `.claude/worktrees/great-swartz/03_Development/supabase/migrations/092_inbox_management.sql` | `services/supabase/migrations/092_inbox_management.sql` | **NEW** (создать + применить) |

---

## 3. Что именно менять

### 3.1 Migration: `services/supabase/migrations/092_inbox_management.sql`

Скопировать из worktree as-is. Содержит:
- `fn_delete_inbox_row(UUID)` — SECURITY DEFINER, запрещает удаление если expense_id NOT NULL
- `fn_sync_inbox_status(UUID)` — автоисправление статуса если expense_id есть но status != 'processed'
- GRANT EXECUTE для authenticated, anon

**Применить:** `supabase db push` или через Dashboard SQL Editor.

### 3.2 Hook: `apps/admin-panel/src/hooks/useReceiptInbox.ts`

**REPLACE** текущий файл версией из worktree. Diff:

Текущий main (урезанный):
```typescript
// InboxRow: нет parsed_payload, parsed_at, gdrive_paths
// status enum: нет 'parsed'
// UseReceiptInboxResult: только rows, isLoading, error, refetch, insert
```

Worktree (полный):
```typescript
// InboxRow: + parsed_payload, parsed_at, gdrive_paths
// status enum: + 'parsed'
// UseReceiptInboxResult: + approve, skip, reopen, deleteRow, syncStatus
```

Новые методы:
- `approve(inboxId, payload)` — вызывает `fn_approve_receipt` RPC, ставит status: 'processed'
- `skip(inboxId)` — status: 'skipped'
- `reopen(inboxId)` — status: 'parsed' (назад на ревью)
- `deleteRow(inboxId)` — вызывает `fn_delete_inbox_row` RPC
- `syncStatus(inboxId)` — вызывает `fn_sync_inbox_status` RPC

### 3.3 Component: `apps/admin-panel/src/components/receipts/InboxList.tsx`

**REPLACE** текущий. Новая версия добавляет:
- `STATUS_BADGE` с 'parsed' (индиго "Ревью")
- Props: `onApprove`, `onSkip`, `onReopen`, `onDelete`
- Expand-строки: клик по чеку со статусом parsed/processed/skipped → раскрывает `InboxReviewPanel`
- Supplier fallback: `parsed_payload.supplier_name || supplier_hint`
- Amount fallback: `parsed_payload.amount_original || amount_hint`
- Кнопка Delete (Trash2) с confirm — скрыта если expense_id есть
- Превью фото (до 3 thumbnail)

### 3.4 Component: `apps/admin-panel/src/components/receipts/InboxReviewPanel.tsx`

**NEW** — ~500+ строк. Детальная панель ревью чека:

**Header section:**
- Поставщик, дата, сумма, номер чека — editable
- Flow type badge (COGS/OpEx/CapEx)
- Invoice number

**Items section (3 табы):**
- Food items: name, original_name, qty, unit, unit_price, total_price, barcode, supplier_sku, nomenclature_id
- CapEx items: name, qty, unit_price, total_price
- OpEx items: description, qty, unit, unit_price, total_price
- Каждая строка: inline edit, delete, checkbox
- Add new item button
- Auto-recalc: qty × unit_price = total_price

**Footer section:**
- Calculated total vs receipt total (mismatch warning)
- Discount amount
- Checked items counter

**Actions:**
- Approve — строит payload и вызывает `onApprove` → `fn_approve_receipt` RPC
- Skip — `onSkip`
- Reopen — `onReopen` (только для skipped)
- Read-only mode для processed чеков

**Nomenclature lookup:**
- При mount загружает nomenclature names для всех nomenclature_id в items
- Показывает код + название рядом с каждым товаром

### 3.5 Page: `apps/admin-panel/src/pages/ReceiptInbox.tsx`

**UPDATE** — прокинуть новые props:

```typescript
// ТЕКУЩИЙ (урезанный):
const { rows, isLoading, error, refetch, insert } = useReceiptInbox()
<InboxList rows={rows} isLoading={isLoading} error={error} onRefetch={refetch} />

// НУЖНО:
const { rows, isLoading, error, refetch, insert, approve, skip, reopen, deleteRow } = useReceiptInbox()
<InboxList
  rows={rows}
  isLoading={isLoading}
  error={error}
  onRefetch={refetch}
  onApprove={approve}
  onSkip={skip}
  onReopen={reopen}
  onDelete={deleteRow}
/>
```

### 3.6 Cleanup

- Удалить `ReceiptEditModal.tsx` (сирота, заменён InboxReviewPanel)
- Проверить что `receipt.ts` types не конфликтуют с InboxReviewPanel

---

## 4. Порядок выполнения

```
1. git checkout -b feature/admin/receipt-review-recovery
2. Применить миграцию 092 (SQL)
3. Скопировать useReceiptInbox.ts из worktree → заменить main
4. Скопировать InboxList.tsx из worktree → заменить main
5. Скопировать InboxReviewPanel.tsx из worktree → создать
6. Обновить ReceiptInbox.tsx page (прокинуть props)
7. Удалить ReceiptEditModal.tsx
8. npm run build — должен пройти без ошибок
9. Проверить на localhost: upload → parsed → expand → approve flow
10. Коммит + PR
```

---

## 5. Приёмка

- [ ] Чек со статусом "parsed" показывает поставщика и сумму из parsed_payload
- [ ] Клик по parsed чеку раскрывает InboxReviewPanel с детальной информацией
- [ ] Строки чека (food/capex/opex) отображаются с баркодами и маппингом
- [ ] Строки можно редактировать inline (qty, price, name)
- [ ] Approve через UI вызывает fn_approve_receipt и создаёт expense_ledger запись
- [ ] Skip ставит status: 'skipped', Reopen возвращает в 'parsed'
- [ ] Delete удаляет чек (только если нет expense_id)
- [ ] Build проходит без ошибок
- [ ] Тестовый чек от 02.04 удаляется через UI

---

## 6. Не в scope этой задачи

- Upload optimization (WebP compression) — отдельная задача, уже работает
- Google Drive дублирование — отдельный трек
- RLS policies — пока нет аутентификации
- Realtime subscriptions — в будущем
