# Finance Module UI Redesign Plan

**Дата:** 2026-04-01
**Статус:** Draft → Awaiting approval
**Автор:** Claude (financial agent)

---

## Проблемы (из обратной связи Леси)

1. **Третья страница чека не открывается** — `tax_invoice_url` рендерится как FileCheck-галочка, не как кликабельный Receipt. Архитектурно: 3 фиксированных URL-поля не поддерживают N-страничные чеки.
2. **Таблица Expense Ledger зажата** — делит экран с формой и графиком, max-width ~60%.
3. **"2.1M" — слишком коротко** — KPI-карточки используют `formatTHB()` с K/M-суффиксами.
4. **Нет полноценной аналитики** — один маленький MonthlyChart, нет трендов, breakdown по категориям.
5. **Нет inline editing** — редактирование через модальное окно.
6. **Баг: COGS не в ExpenseUpdatePayload** — `useExpenseLedger.ts` строка ~60, flow_type union не включает 'COGS'.

---

## Этап 0: Quick Fixes (без изменения структуры)

### 0.1 Исправить отображение tax_invoice_url как кликабельного Receipt

**Файл:** `ExpenseHistory.tsx`, строки 455-459

**Сейчас:**
```tsx
{r.has_tax_invoice ? (
  <span title="Tax invoice available">
    <FileCheck className="h-3.5 w-3.5 text-amber-400" />
  </span>
) : null}
```

**Надо:**
```tsx
{r.tax_invoice_url ? (
  <button
    type="button"
    onClick={() => onReceiptClick(r.tax_invoice_url!)}
    title="Tax invoice"
    className="hover:opacity-70"
  >
    <Receipt className="h-3.5 w-3.5 text-amber-400" />
  </button>
) : r.has_tax_invoice ? (
  <span title="Tax invoice (no image)">
    <FileCheck className="h-3.5 w-3.5 text-amber-400/50" />
  </span>
) : null}
```

**Результат:** Все 3 URL кликабельны; если tax_invoice_url заполнен — Receipt-иконка с кликом.

### 0.2 Полные числа в KPI-карточках

**Файл:** `FinanceManager.tsx`, строки ~580-594

Заменить `formatTHB(grandTotal)` → `formatTHBFull(grandTotal)` + добавить "฿" prefix.

**Было:** `All-time Total: 2.1M`
**Станет:** `All-time Total: ฿2,100,000.00`

### 0.3 Баг COGS в ExpenseUpdatePayload

**Файл:** `useExpenseLedger.ts`, строка ~62

Добавить `'COGS'` в union type: `flow_type?: 'OpEx' | 'CapEx' | 'COGS'`

---

## Этап 1: Новая маршрутизация /finance/*

### Структура

```
/finance            → redirect to /finance/ledger
/finance/ledger     → Full-width Expense Ledger (таблица + фильтры)
/finance/entry      → Ввод расхода (форма + MagicDropzone + StagingArea)
/finance/analytics  → Дашборд с графиками и KPI
```

### Реализация

**App.tsx:** Заменить одиночный route на nested:
```tsx
<Route path="/finance" element={<Suspense fallback={<PageLoader />}><FinanceLayout /></Suspense>}>
  <Route index element={<Navigate to="ledger" replace />} />
  <Route path="ledger" element={<FinanceLedger />} />
  <Route path="entry" element={<FinanceEntry />} />
  <Route path="analytics" element={<FinanceAnalytics />} />
</Route>
```

**FinanceLayout.tsx (новый):**
- Общий header: "Finance" + tab navigation (Ledger / New Entry / Analytics)
- `<Outlet />` для дочерних страниц
- Shared data provider: `useExpenseLedger` вызывается один раз в layout, передаётся через context

### Навигация (AppShell sidebar)

Заменить одиночный пункт "Finance" на группу:
- Finance (заголовок)
  - 📊 Ledger
  - ➕ New Entry
  - 📈 Analytics

---

## Этап 2: Full-Width Expense Ledger (/finance/ledger)

### Layout
- **Полная ширина** экрана (убираем двухколоночный grid)
- **Фильтры** — горизонтальная панель сверху (ExpenseFilterPanel)
- **Таблица** — на всю ширину, без max-height ограничения (виртуализированная)
- **Sticky header + footer** как сейчас

### Улучшения таблицы

| Колонка | Ширина | Изменения |
|---------|--------|-----------|
| Expand | 32px | Без изменений |
| Date | 100px | + flow badge |
| Category | 140px | + sub-category |
| Supplier | 160px | + status badge |
| Details | **flex-1** | Больше места, не truncate |
| Amount | 120px | Полная сумма, не K/M |
| Payment | 80px (NEW) | Метод оплаты: cash/transfer/card |
| Paid by | 70px (NEW) | Кто платил |
| Docs | 80px | Все 3 URL кликабельны |
| Edit | 40px | Без изменений |

**Убираем:** колонку Comments (редко используется, видна в развёрнутом SpokeDetail)

### Inline Editing (Phase 2)

Двойной клик на ячейку → inline editor:
- **Details, Comments** → text input
- **Category** → dropdown
- **Supplier** → dropdown with search
- **Status** → select (paid/pending/cancelled)
- **Payment method** → select
- Enter = save, Escape = cancel
- Визуально: ячейка подсвечивается indigo border

### Виртуализация (если >200 строк)

Использовать `@tanstack/react-virtual` для производительности при большом количестве записей.

---

## Этап 3: Receipt Gallery

### Проблема
3 фиксированных URL-поля (supplier/bank/tax) не поддерживают N-страничные чеки.

### Решение: Миграция БД

```sql
-- Migration: add receipt_pages array
ALTER TABLE expense_ledger
  ADD COLUMN receipt_pages TEXT[] DEFAULT '{}';

-- Backfill existing URLs into array
UPDATE expense_ledger
SET receipt_pages = ARRAY_REMOVE(
  ARRAY[receipt_supplier_url, receipt_bank_url, tax_invoice_url],
  NULL
)
WHERE receipt_supplier_url IS NOT NULL
   OR receipt_bank_url IS NOT NULL
   OR tax_invoice_url IS NOT NULL;
```

> **Примечание:** Старые 3 колонки оставляем (backward compatibility), но frontend читает из `receipt_pages`.

### ReceiptGallery Component (новый)

Заменяет ReceiptLightbox. Функционал:

- **Полноэкранный оверлей** с тёмным backdrop
- **Основное изображение** по центру (масштабируемое pinch/scroll zoom)
- **Навигация:** стрелки влево/вправо + keyboard arrows + swipe на мобильных
- **Thumbnail strip** снизу (горизонтальная полоса миниатюр)
- **Счётчик:** "2 / 3" в верхнем левом углу
- **Действия:** Open in new tab, Download, Close (X / Escape)
- **PDF support:** iframe embed (как сейчас)
- **Google Drive links:** /preview embed

### Интеграция

В ExpenseHistory колонке Docs:
- Показывать количество файлов: badge `3` рядом с Receipt-иконкой
- Клик → ReceiptGallery с массивом `receipt_pages`

---

## Этап 4: Analytics Dashboard (/finance/analytics)

### Layout: 2x2 Grid

```
┌─────────────────────────┬──────────────────────────┐
│  Monthly Trend Chart     │  Category Breakdown Pie  │
│  (bar + line overlay)    │  (donut chart)           │
├─────────────────────────┼──────────────────────────┤
│  KPI Cards (4 cards)     │  Top Suppliers Table     │
│  Month / YTD / Avg / Δ  │  (top 10 by spend)       │
└─────────────────────────┴──────────────────────────┘
```

### Компоненты

**MonthlyTrendChart (обновлённый):**
- Stacked bars по flow_type (COGS/OpEx/CapEx)
- Line overlay: cumulative total
- Период: переключатель 3M / 6M / YTD / All
- Высота: 320px (было 220px)
- Полные числа на оси Y

**CategoryBreakdownChart (новый):**
- Donut chart (Recharts PieChart)
- Кликабельные секторы → drill-down в Ledger с фильтром
- Top 6 + "Other"
- Legend с суммами

**KPI Cards (4 штуки):**
- This Month: ฿XX,XXX (полная сумма) + delta%
- Year to Date: ฿X,XXX,XXX
- Monthly Average: ฿XX,XXX
- Transaction Count: XXX

**TopSuppliersTable (новый):**
- Top 10 suppliers по total spend за период
- Колонки: Rank, Supplier, Total, % of Total, Avg per receipt
- Кликабельные строки → Ledger с фильтром по supplier

### Фильтры (общие для всех графиков)
- Date range picker (период)
- Flow type toggles (COGS / OpEx / CapEx)

---

## Этап 5: Finance Entry Page (/finance/entry)

Переносим сюда:
- ExpenseForm (ручной ввод)
- SmartTextInput (быстрый текстовый ввод)
- MagicDropzone (загрузка чеков)
- StagingArea (превью AI-парсинга)

Layout:
```
┌──────────────────────────────────────┐
│  MagicDropzone (full width)          │
├──────────────────────────────────────┤
│  StagingArea (when active)           │
├──────────────┬───────────────────────┤
│  ExpenseForm │  Recent entries (5)   │
│  + SmartText │  (quick reference)    │
└──────────────┴───────────────────────┘
```

---

## Порядок реализации

| # | Задача | Сложность | Зависимости |
|---|--------|-----------|-------------|
| 0.1 | Tax invoice URL → clickable Receipt | 5 min | — |
| 0.2 | Full numbers in KPI | 5 min | — |
| 0.3 | COGS в ExpenseUpdatePayload | 2 min | — |
| 1 | Routing /finance/* + FinanceLayout | 1-2h | — |
| 2 | Full-width Ledger page | 2-3h | Этап 1 |
| 3.1 | DB migration receipt_pages | 15 min | — |
| 3.2 | ReceiptGallery component | 2-3h | Этап 3.1 |
| 4 | Analytics dashboard | 3-4h | Этап 1 |
| 5 | Finance Entry page | 1-2h | Этап 1 |
| 2+ | Inline editing | 3-4h | Этап 2 |

**Общая оценка:** ~15-20 часов разработки

---

## Файлы для создания/изменения

### Новые файлы:
- `src/pages/FinanceLayout.tsx` — Layout с tabs + Outlet
- `src/pages/FinanceLedger.tsx` — Full-width ledger page
- `src/pages/FinanceEntry.tsx` — Entry form page
- `src/pages/FinanceAnalytics.tsx` — Analytics dashboard
- `src/components/finance/ReceiptGallery.tsx` — Multi-page receipt viewer
- `src/components/finance/CategoryBreakdownChart.tsx` — Donut chart
- `src/components/finance/TopSuppliersTable.tsx` — Top suppliers ranking
- `supabase/migrations/XXX_add_receipt_pages.sql` — DB migration

### Изменяемые файлы:
- `src/App.tsx` — Nested routes for /finance/*
- `src/components/finance/ExpenseHistory.tsx` — tax_invoice_url clickable + full numbers
- `src/components/finance/helpers.ts` — (без изменений, formatTHBFull уже есть)
- `src/components/finance/MonthlyChart.tsx` — Увеличить, добавить flow_type stacking
- `src/components/finance/KpiCard.tsx` — Full number display
- `src/hooks/useExpenseLedger.ts` — COGS fix + receipt_pages field
- `src/pages/FinanceManager.tsx` — Рефакторинг → FinanceEntry (сохраняем логику)
- `src/layouts/AppShell.tsx` — Finance sub-navigation

### Удаляемые файлы:
- `src/components/finance/ReceiptLightbox.tsx` — Заменён на ReceiptGallery
