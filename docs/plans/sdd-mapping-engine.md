# SDD: Inventory & Financial Mapping Engine (Phase 6.x)

> System Design Document — Shishka Healthy Kitchen
> Дата: 2026-03-12 | Автор: Claude (Meta-Architect) | Заказчик: Boris (CEO)

---

## 0. Executive Summary

Phase 6 реализовала ~85% функциональности Mapping Engine. Ядро (supplier_item_mapping, useSupplierMapping.ts, StagingArea, ReconciliationPanel, Anti-Hallucination pipeline) — **уже в проде**. Этот SDD фиксирует архитектуру BUILT-системы и определяет оставшиеся 15% — прежде всего **UoM Conversion на уровне approval** и **UI для конверсии** в StagingArea.

---

## 1. Mapping Engine (SKU → Nomenclature + UoM)

### 1.1 Что построено

**Таблица `supplier_item_mapping`** (Migration 039):

| Колонка | Тип | Назначение |
|---------|-----|------------|
| id | UUID PK | — |
| supplier_id | FK → suppliers | Поставщик |
| nomenclature_id | FK → nomenclature | Наш внутренний товар |
| original_name | TEXT | Название с чека (как Gemini распознал) |
| supplier_sku | TEXT | SKU поставщика (напр. Makro barcode) |
| match_count | INT DEFAULT 1 | Счётчик использований (ранжирование) |
| purchase_unit | TEXT | Единица на чеке ("bag", "box", "pack") |
| conversion_factor | NUMERIC | Множитель → base_unit |
| base_unit | TEXT | Кухонная единица (kg / L / pcs) |

**Resolution Chain** (useSupplierMapping.ts):

```
Вход: { supplier_id, supplier_sku?, original_name }
  │
  ├─ [1] supplier_sku match → SELECT WHERE supplier_sku = ? AND supplier_id = ?
  │     ORDER BY match_count DESC LIMIT 1
  │     ✓ found → return MappingMatch (с conversionFactor, purchaseUnit, baseUnit)
  │
  ├─ [2] original_name match → SELECT WHERE original_name ILIKE ?
  │     ORDER BY match_count DESC LIMIT 1
  │     ✓ found → return MappingMatch
  │
  └─ [3] unmapped → return null → StagingArea показывает amber border
```

**Индексы** — NON-UNIQUE. Один SKU может маппиться на разные nomenclature_id (разные поставщики могут использовать одинаковые SKU). Дизамбигуация через `match_count DESC`.

**saveMapping()** — UPSERT-логика:
- Существующий маппинг → `match_count++` (UPDATE)
- Новый маппинг → INSERT с `match_count = 1`

### 1.2 UoM Conversion — GAP

**Схема готова** (поля purchase_unit, conversion_factor, base_unit в supplier_item_mapping). **Хук готов** (MappingMatch возвращает все 3 поля).

**Разрыв:** `fn_approve_receipt` (v5, Migration 038) записывает в `purchase_logs.quantity` сырое значение с чека **без умножения на conversion_factor**.

**Решение (Phase 6.4):**

```
fn_approve_receipt v6:
  FOR EACH line_item:
    mapping ← SELECT conversion_factor, base_unit
               FROM supplier_item_mapping
               WHERE supplier_id = $supplier AND nomenclature_id = $item
               ORDER BY match_count DESC LIMIT 1;

    IF mapping.conversion_factor IS NOT NULL THEN
      final_qty ← line_item.quantity × mapping.conversion_factor
      final_unit ← mapping.base_unit
    ELSE
      final_qty ← line_item.quantity
      final_unit ← line_item.unit  -- as-is from receipt
    END IF;

    INSERT INTO purchase_logs (quantity, ...) VALUES (final_qty, ...);
```

**Принцип:** Если conversion_factor = NULL → пишем as-is (обратная совместимость). Конверсия применяется только когда CEO явно задал множитель.

### 1.3 UoM UI в StagingArea — GAP

StagingArea уже показывает маппинг (зелёный = mapped, amber = unmapped, красный = low confidence). Нужно добавить:

1. **UoM Badge** рядом с каждым line_item: `2 × bag → 10 kg` (если conversion_factor задан)
2. **Inline UoM Editor** (при клике на badge): поля purchase_unit, conversion_factor, base_unit
3. **Batch UoM Tuning** — отдельная таблица в Procurement для массовой настройки конверсий

**Data Flow:**
```
StagingArea line_item
  → показать: "2 bag" (raw) + "→ 10 kg" (converted preview)
  → клик на badge → inline form (purchase_unit, ×factor, base_unit)
  → saveMapping() обновляет supplier_item_mapping
  → следующий чек от этого поставщика → auto-convert
```

---

## 2. Financial Reconciliation

### 2.1 Что построено (Migration 038 + GAS + Frontend)

**Gemini извлекает footer:**
```json
{
  "subtotal": 1250.00,
  "discount_total": -50.00,
  "vat_amount": 84.00,
  "grand_total": 1284.00
}
```

**Формула баланса:**
```
subtotal + discount_total + vat_amount = grand_total
```

Где `discount_total` всегда отрицательное (или 0).

**ReconciliationPanel** (в StagingArea):
- Показывает все 4 поля как editable inputs
- Вычисляет `computed_total = subtotal + discount_total + vat_amount`
- `delta = computed_total - grand_total`
- Зелёная галочка при `|delta| < 0.01` (balanced)
- Красный alert при `|delta| >= 0.01` (unbalanced)
- CEO может вручную подправить любое поле до апрува

**Cross-check с line items:**
```
sum(line_items[].total_price) ≈ subtotal
```

GAS проверяет это в post-processing и ставит `footer_confidence` (high/medium/low).

### 2.2 Что хранится в БД (после approval)

`expense_ledger`:
- `amount` ← grand_total
- `discount_total` ← discount_total
- `vat_amount` ← vat_amount
- `invoice_number` ← из чека (если Gemini распознал)

`purchase_logs` (по строкам):
- Одна запись на каждый line_item
- `quantity`, `price_per_unit`, `total_price`

**Инвариант:** `SUM(purchase_logs.total_price) + discount_total + vat_amount = expense_ledger.amount`

### 2.3 Оставшиеся решения

Нет критичных разрывов. Система работает end-to-end. Потенциальные улучшения:
- **Audit trail**: Логировать ручные правки CEO в ReconciliationPanel (tech debt)
- **Auto-split VAT**: Для чеков без explicit VAT строки — рассчитать 7% от subtotal (тайский стандарт)

---

## 3. Workflow: Pre-fill vs Dynamic

### 3.1 Архитектурное решение: **Hybrid (Dynamic-first)**

CEO **НЕ должен** заранее вбивать все товары. Система работает по принципу **"встретил — создай"**:

### 3.2 Реализованный flow

```
Чек загружен → Gemini парсит → StagingArea показывает line_items
  │
  ├─ [Mapped] — зелёный border, nomenclature_id уже привязан
  │   → При approval: INSERT purchase_logs + match_count++
  │
  ├─ [Unmapped, похожий найден] — amber border + suggestion
  │   → CEO кликает suggestion → saveMapping() → зелёный
  │   → Следующий чек: auto-mapped
  │
  └─ [Unmapped, ничего похожего] — красный border + кнопка "Create Item"
      → CEO кликает → NomenclatureModal opens
      → Авто-генерация: product_code = "RAW-{SLUG}", name из чека
      → CEO подтверждает → INSERT nomenclature + saveMapping()
      → Следующий чек: auto-mapped
```

### 3.3 Стратегия обучения системы

**Cold Start (первые 5-10 чеков):**
- ~80% товаров unmapped
- CEO создаёт nomenclature items через Create Item modal
- Каждое создание автоматически сохраняет маппинг

**Warm State (после 10+ чеков от одного поставщика):**
- ~90%+ товаров auto-mapped (SKU match или name match)
- CEO только подтверждает и изредка создаёт новые товары

**Steady State:**
- ~98% auto-mapped
- Новые товары появляются редко (сезонные, новые поставщики)
- match_count обеспечивает правильное ранжирование при дубликатах

### 3.4 Почему НЕ Pre-fill

1. **Makro каталог = 10,000+ SKU.** CEO не будет вбивать их заранее.
2. **SKU меняются.** Makro перевыпускает barcode при ребрендинге.
3. **Dynamic = zero upfront cost.** Система учится по мере работы.
4. **match_count** — встроенный "ML без ML". Чем чаще маппинг используется, тем выше приоритет.

---

## 4. Eradicating Hallucinations

### 4.1 Трёхслойная оборона (BUILT)

#### Layer 1: Prompt Engineering (ReceiptParser.gs)

```
Ключевые директивы в системном промпте:
- "item_count_observed: COUNT items you can PHYSICALLY SEE"
- "confidence: 0.0-1.0 for EACH field"
- "If text is unreadable → value: '[UNREADABLE]', confidence: 0.0"
- "NEVER guess or hallucinate product names"
- "Thai text: transliterate, don't translate"
```

`item_count_observed` — anchor point. Gemini сначала считает физические строки на чеке, потом парсит. Если `len(items) != item_count_observed` → GAS ловит расхождение.

#### Layer 2: GAS Post-Processing (server-side)

```
validateAndClean(result):
  [1] Item Count Check:
      items.length vs item_count_observed
      → mismatch → warning flag + log

  [2] Price Math Check:
      FOR EACH item: quantity × price_per_unit ≈ total_price (±1 бат)
      → mismatch → flag item

  [3] Duplicate Detection:
      Same name + same price in consecutive lines
      → flag as potential hallucination

  [4] Footer Cross-Check:
      SUM(items.total_price) ≈ footer.subtotal
      → mismatch → lower footer_confidence
```

#### Layer 3: Frontend Visual Defense (StagingArea)

```
Confidence → Border Color:
  >= 0.8  → зелёный (high confidence)
  0.5-0.8 → amber (medium, review recommended)
  < 0.5   → красный (low confidence, likely hallucinated)

Warning Tooltips:
  "Price math mismatch" — если qty × unit_price ≠ total
  "Possible duplicate" — если подозрение на дубликат
  "Item count mismatch" — если количество строк не совпало

[UNREADABLE] display:
  → Показывается как-is в красном
  → CEO вручную вводит значение или удаляет строку
```

### 4.2 Почему это работает

1. **item_count_observed** не даёт модели "придумать" лишние строки. Якорь в физическую реальность.
2. **confidence scoring** на уровне каждого поля — модель сама оценивает свою уверенность.
3. **[UNREADABLE]** лучше, чем галлюцинация. CEO видит красную ячейку и знает, что нужно проверить.
4. **3 слоя независимы.** Даже если один пропустит — следующий поймает.

### 4.3 Оставшиеся улучшения

- **Batch confidence review**: Отдельный view для всех [UNREADABLE] и low-confidence полей по всем чекам за период (аналитика качества OCR)
- **Feedback loop**: Когда CEO исправляет [UNREADABLE] → логировать пару (image_crop, correct_value) для будущего fine-tuning
- **Второй проход**: Для low-confidence чеков — повторный запрос к Gemini с `thinkingBudget: 1024` (медленнее, но точнее)

---

## 5. Оставшиеся GAP-ы (Phase 6.x Roadmap)

| # | GAP | Приоритет | Миграция? | Файлы |
|---|-----|-----------|-----------|-------|
| 6.4 | fn_approve_receipt v6: применить conversion_factor | P0 | Да (ALTER fn) | migration_040 |
| 6.5 | UoM Badge + Inline Editor в StagingArea | P1 | Нет | StagingArea.tsx |
| 6.6 | Batch UoM Tuning в Procurement | P2 | Нет | Procurement.tsx, useSupplierMapping.ts |
| 6.7 | Auto-split VAT (7% Thai standard) | P3 | Нет | GAS + StagingArea |
| 6.8 | Confidence Analytics view | P3 | Нет | New component |

**Порядок:** 6.4 → 6.5 → 6.6 (последовательно, каждый зависит от предыдущего). 6.7 и 6.8 независимы.

---

## 6. Архитектурная диаграмма (End-to-End)

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│ MagicDropzone │────→│ receipt_jobs   │────→│ Edge: parse-receipts │
│ (WebP upload) │     │ (pending)      │     │ → GAS Web App    │
└──────────────┘     └───────────────┘     └──────────────────┘
                                                    │
                           ┌────────────────────────┘
                           ▼
                    ┌──────────────┐
                    │ GAS          │
                    │ Gemini 2.5   │
                    │ Flash        │
                    │              │
                    │ [Layer 1+2]  │
                    │ Prompt +     │
                    │ Post-process │
                    └──────┬───────┘
                           │ callback
                           ▼
                    ┌──────────────────┐
                    │ Edge: update-    │
                    │ receipt-job      │
                    │ (service role)   │
                    └──────┬───────────┘
                           │
                           ▼
                    ┌──────────────┐     Realtime
                    │ receipt_jobs  │────────────────┐
                    │ (completed)   │                │
                    └──────────────┘                ▼
                                            ┌──────────────┐
                                            │ FinanceManager│
                                            │ Realtime sub  │
                                            └──────┬───────┘
                                                   │
                                    ┌──────────────┘
                                    ▼
                    ┌───────────────────────────────────┐
                    │          StagingArea               │
                    │                                   │
                    │  ┌─ applyMappings() ──────────┐   │
                    │  │ useSupplierMapping          │   │
                    │  │ SKU → name → unmapped       │   │
                    │  └────────────────────────────┘   │
                    │                                   │
                    │  ┌─ ReconciliationPanel ──────┐   │
                    │  │ subtotal + disc + VAT =    │   │
                    │  │ grand_total (editable)     │   │
                    │  └────────────────────────────┘   │
                    │                                   │
                    │  ┌─ [Layer 3] Confidence ─────┐   │
                    │  │ Green / Amber / Red borders │   │
                    │  │ [UNREADABLE] display        │   │
                    │  └────────────────────────────┘   │
                    │                                   │
                    │  [Create Item] → NomenclatureModal │
                    │  [Approve] → fn_approve_receipt    │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────┐
                    │ fn_approve_receipt (v6*)  │
                    │                          │
                    │ → INSERT expense_ledger   │
                    │ → INSERT purchase_logs    │
                    │   (× conversion_factor)  │
                    │ → UPDATE match_count++    │
                    │ → TRIGGER: update cost    │
                    └──────────────────────────┘

                    * v6 = Phase 6.4 (GAP)
```

---

## 7. Решения (Decision Log)

| # | Вопрос | Решение | Обоснование |
|---|--------|---------|-------------|
| D1 | Pre-fill vs Dynamic? | Dynamic-first (Hybrid) | Makro каталог слишком велик, match_count = встроенное обучение |
| D2 | UoM: хранить converted или raw? | Raw в receipt_jobs, converted в purchase_logs | Аудит: всегда можно пересчитать из оригинала |
| D3 | Один SKU → много nomenclature? | Да, NON-UNIQUE index | Разные поставщики могут иметь одинаковый SKU |
| D4 | [UNREADABLE] vs guess? | Всегда [UNREADABLE] | Галлюцинация дороже ручного ввода |
| D5 | Reconciliation auto-fix? | Нет, только visual alert | CEO должен осознанно подтвердить цифры |
| D6 | conversion_factor NULL? | Пропустить конверсию (as-is) | Обратная совместимость, gradual rollout |

---

*→ Schema: `02_Obsidian_Vault/Database Schema.md`*
*→ Modules: `docs/context/modules/receipts.md`, `docs/context/modules/procurement.md`, `docs/context/modules/finance.md`*
*→ Phase history: `docs/context/phases/phase-6-mapping.md`*
