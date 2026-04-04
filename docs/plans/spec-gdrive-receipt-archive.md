# Spec: GDrive Receipt Archive — автоматическое сохранение чеков на Google Drive

> **MC Task:** TBD | Priority: HIGH
> **Author:** COO + Claude Code | **Date:** 2026-04-04
> **For:** Finance Agent + MCP Finance Dev
> **Branch:** `feature/shared/gdrive-receipt-archive`

---

## 0. TL;DR

После approve чека в Admin Panel — агент (или хук) скачивает фото из Supabase Storage, переименовывает по конвенции и сохраняет в `01_Business/Receipts/processed/{YYYY-MM}/` на Google Drive. Путь записывается в `receipt_inbox.gdrive_paths`.

---

## 1. Контекст

### Текущее состояние
- Фото чеков хранятся в Supabase Storage (`receipts/inbox/...`)
- После approve → запись в `expense_ledger`, URL фото остаётся в Supabase
- `receipt_inbox.gdrive_paths` — поле есть, но **всегда null**
- GDrive папка `01_Business/Receipts/processed/` существует, там legacy файлы с ручной раскладкой

### Проблема
- Нет резервной копии чеков вне Supabase Storage
- Нет человекочитаемого архива — Леся не может найти чек по дате/поставщику в файлах
- Supabase Storage — blob с UUID-именами, невозможно найти нужный файл руками
- Нет аудит-трейла в файловой системе

### Целевое состояние
```
Approve в Admin Panel
  → fn_approve_receipt (уже работает)
  → [NEW] archive_to_gdrive:
       1. Скачать фото из Supabase Storage
       2. Переименовать: {Supplier}_{YYYY-MM-DD}_{InvoiceNo}_p{N}.{ext}
       3. Сохранить в 01_Business/Receipts/processed/{YYYY-MM}/
       4. Обновить receipt_inbox.gdrive_paths = [path1, path2, ...]
```

---

## 2. Конвенция именования файлов

На основе существующих файлов в `processed/`:

```
{Supplier}_{YYYY-MM-DD}_{InvoiceNo}_p{PageNum}.{ext}
```

**Примеры:**
- `Makro_2026-03-19_570-831003_p1.jpg` — единственное фото
- `Makro_2026-03-30_AM_p1.jpeg`, `..._p2.jpeg`, `..._p3.jpeg` — мульти-фото
- `NewTon_2026-03-15_p1.webp` — без invoice number

**Правила:**
- Supplier: транслитерация, без пробелов (CamelCase или дефис). Макс 30 символов.
- Date: ISO `YYYY-MM-DD` (solar, не Buddhist Era!)
- InvoiceNo: если есть — как есть (без спецсимволов). Если нет — пропустить сегмент.
- PageNum: `p1`, `p2`, ... — по порядку из `photo_urls[]`
- Extension: сохранить оригинальное расширение файла

**Sanitize:** заменить `/\:*?"<>|` → `_`, trim whitespace.

---

## 3. Структура папок на GDrive

```
01_Business/Receipts/
├── processed/
│   ├── 2026-03/              ← папка по месяцу (auto-create если нет)
│   │   ├── Makro_2026-03-19_570-831003_p1.jpg
│   │   └── NewTon_2026-03-15_p1.webp
│   └── 2026-04/
│       └── ...
├── bank-transfers/           ← для receipt_bank_url (если отличается)
├── tax-invoices/             ← для tax_invoice_url (если отличается)
└── payloads/                 ← JSON payload backup (опционально, phase 2)
```

---

## 4. Архитектурные опции

### Опция A: MCP тул `archive_receipt_gdrive` (рекомендовано)

Новый тул в `services/mcp-finance/` — агент вызывает после approve.

**Плюсы:** агент контролирует flow, может retry, логировать.
**Минусы:** требует GDrive API credentials в MCP.

### Опция B: Post-approve hook в Admin Panel

Frontend после успешного approve вызывает API endpoint.

**Минусы:** зависит от браузера, не работает если approve через MCP напрямую.

### Опция C: Database trigger / Edge Function

PostgreSQL trigger на `receipt_inbox` при `status → 'processed'`.

**Минусы:** сложность, нужен отдельный сервис для GDrive API.

**Рекомендация: Опция A** — MCP тул, встроенный в workflow агента.

---

## 5. Реализация (Опция A)

### 5.1 Новый MCP тул: `archive_receipt_gdrive`

```typescript
// Tool name: "archive_receipt_gdrive"
// Description: "Download receipt photos from Supabase Storage, rename with convention,
//              save to Google Drive processed folder, update gdrive_paths in inbox."

// Parameters:
{
  inbox_id: z.string().uuid()
    .describe("Receipt inbox ID to archive"),
}

// Returns:
{
  ok: boolean,
  inbox_id: string,
  gdrive_paths: string[],        // ["01_Business/Receipts/processed/2026-03/Makro_2026-03-19_570-831003_p1.jpg"]
  files_archived: number,
  error?: string,
}
```

### 5.2 Логика тула

```
1. Получить receipt_inbox row по inbox_id
2. Проверить: status = 'processed' (не архивировать неподтверждённые)
3. Извлечь metadata из parsed_payload:
   - supplier_name → sanitize
   - transaction_date → YYYY-MM-DD
   - invoice_number → sanitize (optional)
4. Для каждого photo_urls[i]:
   a. download из Supabase Storage (через download_receipt логику)
   b. Сформировать filename: {Supplier}_{Date}_{Invoice}_p{i+1}.{ext}
   c. Определить target folder: processed/{YYYY-MM}/
   d. Создать папку если не существует
   e. Загрузить файл в GDrive
5. Обновить receipt_inbox.gdrive_paths = [path1, path2, ...]
6. Вернуть результат
```

### 5.3 GDrive Auth

Используем **Google Drive API v3** через Service Account (Shared Drive access):

- Service Account JSON → env variable `GDRIVE_SERVICE_ACCOUNT_JSON`
- Shared Drive ID → env variable `GDRIVE_SHARED_DRIVE_ID`
- Target folder ID (01_Business/Receipts/) → env variable `GDRIVE_RECEIPTS_FOLDER_ID`

**Альтернатива:** OAuth2 с refresh token (как в legacy `mcp-gdrive-server/`). Service Account предпочтительнее — не требует ручного refresh.

### 5.4 Зависимости

```json
{
  "googleapis": "^140.0.0"    // Google Drive API client
}
```

---

## 6. Интеграция в workflow агента

### AGENT.md — добавить шаг после approve:

```
## Receipt Processing Workflow (обновлённый)

Шаг 8 (после approve): Архив на GDrive
   ├─ archive_receipt_gdrive(inbox_id)
   ├─ Если ok: "✓ Чек сохранён: {gdrive_paths[0]}"
   └─ Если error: "⚠ GDrive архив не удался: {error}. Чек записан в БД, фото только в Supabase."
```

**Важно:** ошибка GDrive архивации — **не блокирует** approve. Чек уже в БД. Просто предупреждение.

### InboxReviewPanel — отображение gdrive_paths

Уже реализовано! Секция с `FolderOpen` иконкой показывает `row.gdrive_paths` если они есть.

---

## 7. Порядок выполнения

```
1. Получить/создать Service Account для GDrive Shared Drive
2. Настроить env: GDRIVE_SERVICE_ACCOUNT_JSON, GDRIVE_SHARED_DRIVE_ID, GDRIVE_RECEIPTS_FOLDER_ID
3. Реализовать archive_receipt_gdrive тул в services/mcp-finance/
4. Зарегистрировать тул в index.ts
5. Обновить AGENT.md — добавить шаг 8 в workflow
6. Тест: archive_receipt_gdrive(inbox_id: "cec1e542-...") → проверить файл на GDrive
7. Тест: мульти-фото чек → проверить p1, p2 именование
8. Коммит + PR
```

---

## 8. Приёмка

- [ ] После approve чека фото появляется в `01_Business/Receipts/processed/{YYYY-MM}/`
- [ ] Имя файла: `{Supplier}_{Date}_{Invoice}_p{N}.{ext}`
- [ ] `receipt_inbox.gdrive_paths` заполнено корректными путями
- [ ] В Admin Panel InboxReviewPanel отображает gdrive_paths с иконкой папки
- [ ] Мульти-фото чек → все страницы архивированы (p1, p2, ...)
- [ ] Ошибка GDrive → чек всё равно записан, warning в UI
- [ ] Папка месяца создаётся автоматически если не существует

---

## 9. Не в scope

- Архивация JSON payload в `payloads/` — phase 2
- Bank transfer screenshots → `bank-transfers/` — отдельная задача
- Tax invoice → `tax-invoices/` — отдельная задача (зависит от fix дубля фото)
- Batch архивация старых чеков из Supabase → отдельный скрипт
- Миграция legacy файлов из `_legacy/` / `_legacy_receipts/`

---

## 10. Открытые вопросы

1. **Service Account vs OAuth2?** — Service Account проще (нет refresh), но нужно добавить его в Shared Drive с правами Editor. Леся, подтверди какой вариант.
2. **Folder ID `01_Business/Receipts/`** — нужно получить GDrive folder ID. Можно через `find_files.mjs` из worktree или вручную через GDrive UI (правый клик → Get link).
3. **Когда архивировать?** — Сразу после approve (синхронно в workflow агента) или отложенно (batch job)? Рекомендация: сразу, но non-blocking.
