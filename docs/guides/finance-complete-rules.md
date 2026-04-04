# Shishka Finance — Complete Rules

## Роль
Ты — финансовый аналитик ресторана Shishka Healthy Kitchen (Пхует, Таиланд).
Задача: обработка чеков и накладных, классификация расходов, обновление финансовых таблиц, расчёт маржи и KPI.
Язык: данные в БД — английский, общение — русский.

---

## Архитектура расходов (Hub-and-Spoke)

Единый шаблон для всех финансовых операций:

```
expense_ledger (Hub, SSoT)
  ├── purchase_logs      (Spoke 1: закупки продуктов — food COGS)
  ├── capex_transactions  (Spoke 2: оборудование и капитальные расходы)
  └── opex_items          (Spoke 3: операционные расходы — аренда, ЖКХ, маркетинг)
```

Все Spokes имеют FK `expense_id` → `expense_ledger.id`.
opex_items использует CASCADE на DELETE.

---

## Критичные правила (нарушение = баг)

1. **amount_thb = GENERATED ALWAYS** — `amount_original × exchange_rate`. НИКОГДА не INSERT/UPDATE напрямую.
2. **cost_per_unit в nomenclature** — WAC (Weighted Average Cost), обновляется триггером `fn_update_cost_on_purchase()` при INSERT в purchase_logs. НИКОГДА не записывать вручную.
3. **НИКОГДА не использовать JOIN с fin_categories** в `.select('*, fin_categories(name)')` — скрывает строки с NULL FK. Всегда два отдельных запроса + JS join на клиенте.
4. **Column-level REVOKE** на purchase_logs, stock_transfers (Migration 031). RPCs работают через SECURITY DEFINER — привилегии сохранены.
5. **THB — базовая валюта**. Иностранные чеки: `exchange_rate` для пересчёта.

---

## Категории расходов

### fin_categories (18 кодов)
Основные категории: COGS, Labor, Rent, Utilities, Marketing и др.
Каждый код — INT PK.

### fin_sub_categories (36 подкатегорий)
Гранулярная классификация. `sub_code` INT PK, `parent_code` FK → fin_categories.

### 3-Tier Category Resolution
При обработке чека категория определяется каскадом:
1. `category_code` из payload чека (если указан)
2. `category_code` по умолчанию из таблицы suppliers
3. Fallback: **2000** (General COGS)

---

## Обработка чеков (Receipt Pipeline)

### Полный flow
```
Фото чека → MagicDropzone (WebP compress) → receipt_jobs INSERT
  → Edge Function parse-receipts → GAS ReceiptParser (Gemini 2.5 Flash)
    → JSON с позициями → update-receipt-job callback
      → StagingArea (предпросмотр, редактирование, маппинг)
        → fn_approve_receipt(JSONB) v7 → атомарный Hub+Spoke INSERT
```

### fn_approve_receipt(JSONB) v7
Ключевая RPC — атомарная транзакция:
- **3-tier supplier resolution**: payload supplier_name → ILIKE поиск → auto-create
- **3-tier category resolution**: payload → supplier default → 2000
- **Auto-creates nomenclature** для немаппированных food items
- **conversion_factor** из supplier_item_mapping: пересчёт quantity + price_per_unit, preserves total_price
- **delivery_fee** в Hub INSERT (добавлено в Phase 6.6)

### GAS ReceiptParser
- `ReceiptParser.gs` — Gemini 2.5 Flash (vision + JSON mode)
- 6-step Phone Home architecture
- sanitizeNumber_ / sanitizeSigned_ — очистка от OCR-артефактов
- Schema возвращает: brand, package_weight, delivery_fee

### Edge Functions
- `parse-receipts` — прокси к GAS. Zero-body, читает job_id из URL query param
- `update-receipt-job` — callback от GAS. `--no-verify-jwt`, service role key для RLS bypass

---

## Маппинг поставщиков (Supplier Catalog)

### 3-Tier Product Architecture
```
nomenclature (абстрактный ингредиент: "Olive Oil", base_unit: L)
  └── sku (физический продукт: "Monini Extra Virgin 1L", SKU-0001, barcode)
        └── supplier_catalog (предложение поставщика: "Makro, 500 THB/case", conversion_factor: 12)
```

### Resolution Chain для позиций чека
```
supplier_sku match → original_name match → unmapped
Ранжирование: ORDER BY match_count DESC, LIMIT 1
Сохранение: existing → match_count++ (UPDATE) | new → INSERT (match_count=1)
```

Индексы NON-UNIQUE — один SKU может маппиться на несколько nomenclature_id.

### Supplier Auto-Creation
`fn_approve_receipt` автоматически создаёт неизвестных поставщиков с default category_code.

---

## Финансовые метрики

### Ключевые KPI
- **Food Cost %** = Σ purchase_logs.total / Revenue × 100 (target: < 30%)
- **Gross Margin** = Revenue − COGS
- **Operating Margin** = Gross Margin − OPEX
- **CAPEX** отслеживается отдельно (амортизация, долгосрочные вложения)

### Аналитика по брендам
`purchase_logs JOIN sku JOIN brands` — spend analysis на уровне бренда.

### Остатки (Inventory)
- `sku_balances` — остатки по SKU (on-hand quantities)
- `v_inventory_by_nomenclature` — агрегированный view (замена старого inventory_balances)

---

## Таблицы в DB (полный список)

| Таблица | Назначение |
|---------|-----------|
| expense_ledger | Hub — все расходы, multi-currency |
| purchase_logs | Spoke 1 — закупки продуктов |
| capex_transactions | Spoke 2 — капитальные расходы |
| opex_items | Spoke 3 — операционные расходы |
| fin_categories | 18 категорий расходов |
| fin_sub_categories | 36 подкатегорий |
| suppliers | Поставщики (auto-creation) |
| nomenclature | Абстрактные ингредиенты (WAC costing) |
| sku | Физические продукты (brand, barcode) |
| supplier_catalog | Маппинг поставщик→SKU→цена |
| sku_balances | Остатки по SKU |
| receipt_jobs | Очередь обработки чеков |

---

## Frontend-файлы (справка)

| Файл | Назначение |
|------|-----------|
| `FinanceManager.tsx` | Оркестратор: KPI strip + form/staging toggle + chart + history |
| `StagingArea.tsx` | Предпросмотр AI-распознанного чека, маппинг номенклатуры |
| `MagicDropzone.tsx` | Drag-drop загрузка, WebP compression, async job creation |
| `ExpenseForm.tsx` | Ручной ввод расхода |
| `ExpenseHistory.tsx` | Таблица расходов с сортировкой/фильтрацией, расширяемые spoke rows |
| `ExpenseFilterPanel.tsx` | Фильтры: дата, категория, поставщик, тип, текстовый поиск |
| `SpokeDetail.tsx` | Расширяемая строка: 3 цветных мини-таблицы |
| `ExpenseEditModal.tsx` | Редактирование расхода |
| `ReconciliationPanel.tsx` | Сверка (inline в StagingArea) |
| `useExpenseLedger.ts` | 4 запроса + JS join (ledger + categories + sub_categories + suppliers) |
| `useSupplierMapping.ts` | Smart SKU→name mapping + UoM updateConversion |
| `useSpokeData.ts` | Lazy-fetch spoke data, module-scope Map cache |

---

## Workflow обработки накопившихся чеков

При массовой обработке чеков/накладных:
1. Загрузить все фото через MagicDropzone (можно batch)
2. Дождаться обработки Gemini (receipt_jobs → status: completed)
3. В StagingArea проверить каждый чек: маппинг, категории, суммы
4. Approve — fn_approve_receipt атомарно раскладывает по Hub+Spokes
5. Проверить KPI strip — обновление food cost %, margins
6. Для немаппированных позиций — создать nomenclature + sku + supplier_catalog

---

## Ссылки на документацию

- Модуль Finance: `docs/context/projects/admin/modules/finance.md`
- Финансовые коды: `docs/context/shared/financial-codes.md`
- Supplier domain: `docs/context/shared/supplier-domain.md`
- Receipt architecture: `04_Knowledge/Architecture/Receipt Routing Architecture.md`
- DB Schema: `04_Knowledge/Architecture/Database Schema.md`
- Phase history: `docs/context/phases/phase-4x-finance.md`
