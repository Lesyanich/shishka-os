# Financial Mapping Logic — Shishka Healthy Kitchen
**Статус:** Draft v1  
**Дата:** 2026-03-07

Этот документ определяет правила трансформации "сырых" данных из `Expenses.csv` в нормализованную структуру базы данных Supabase.

---

## 1. Сводная таблица маппинга (Legacy -> New Code)

Мы игнорируем текстовые значения в `Category_Name` и `SubCategory_Name` и сопоставляем их на основе `Details` и контекста.

| Raw Category (Legacy) | Example Details | Target Category | Target Sub-Category | Примечание |
|---|-|---|---|---|
| **Rent** | "Rent", "1 year rent" | 2100 (Rental) | 2101 (Monthly Rent) | |
| **Legal** | "Consalt", "Ram", "Visa" | 3100 (Legal) | 3101 (Accounting/Tax) / 3102 | |
| **Equipment** | "Printer", "Blast Chiller" | 1200 (Kitchen Eq) | 1201/1202/1203 | Зависит от типа оборудования |
| **Construction** | "Renovation", "Tile", "Paint" | 1100 (Construction) | 1101/1102/1103 | Зависит от вида работ |
| **Furniture** | "Chairs", "Tables" | 1300 (Furniture) | 1301 (Dining Furniture) | |
| **Decoration** | "Cups", "Plates", "Vase" | 1300 (Furniture) | 1302 (Custom Fixtures) | Посуда идет в декор |
| **IT Software** | "Host", "Google" | 1400 (IT Software) | 1401/1402 | |
| **Utilities** | "Electricity", "Water" | 2200 (Utilities) | 2201/2202 | |

---

## 2. Алгоритм маппинга для импорта

Для автоматизации импорта в PostgreSQL (через Python скрипт или SQL трансформацию) используются следующие правила:

### 2.1. Группа 1000: Assets (CapEx)
- Если `Flow type` = 'CapEx':
  - `Category_Name` ~ 'Construction' -> 1100
  - `Category_Name` ~ 'Equipment' -> 1200
  - `Category_Name` ~ 'Furniture'|'Decoration' -> 1300
  - `Category_Name` ~ 'Legal' (в контексте компании) -> 3100 (или 1000 если капитализируется)

### 2.2. Группа 2000: OpEx
- Если `Flow type` = 'OpEx':
  - `Category_Name` ~ 'Rent' -> 2100
  - `Category_Name` ~ 'Utilities'|'Water/electricity' -> 2200
  - `Category_Name` ~ 'IT Software' -> 1400 (Операционные лицензии)

---

## 3. Требования к SQL Schema

При импорте в таблицу `capex_transactions`, мы заменяем текстовые поля `Category_Name` на ссылки:
- `category_code` (FK -> fin_categories.code)
- `sub_category_code` (FK -> fin_sub_categories.sub_code)

---

## 4. Карта Supplier -> Category
(Для будущего уточнения)
- `landlord-1` -> 2100 / 2101
- `Richi Construction` -> 1100 / (1101, 1102, 1103)
- `Host` -> 1400 / 1401
- `Ram` -> 3100 / 3102
