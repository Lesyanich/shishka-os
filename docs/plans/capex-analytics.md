# PLAN: CapEx and Financial Analytics Module
**Slug:** `capex-analytics`  
**Агент:** Lead Backend Developer  
**Дата:** 2026-03-07  
**Статус:** 🟡 Ожидает подтверждения

---

## Контекст

Необходимо реализовать модуль финансовой аналитики и CapEx в Supabase.
Модуль решает три задачи:
1. Регистрация активов (оборудования) с их начальной стоимостью и сроком службы.
2. Логирование всех транзакций (покупка, ремонт).
3. Расчёт почасовой стоимости амортизации для планирования производства.

---

## Предлагаемые Изменения

### [Backend] [Supabase Migration]

#### [NEW] [003_capex_analytics.sql](file:///Users/lesianich/Library/CloudStorage/GoogleDrive-lesia@shishka.health/Общие диски/Shishka healthy kitchen/03_Development/database/003_capex_analytics.sql)

- Создание таблицы `capex_assets` (id, equipment_code, initial_value, residual_value, useful_life_months, etc.)
- Создание таблицы `capex_transactions` (id, transaction_id, asset_id, amount_thb, etc.)
- Создание View `v_equipment_hourly_cost`.

### [Logic] [SQL View]

SQL Refinement (Architecture Approved):
```sql
CREATE OR REPLACE VIEW v_equipment_hourly_cost AS
SELECT 
    e.id AS equipment_uuid,
    e.id AS equipment_code, -- Our unit_id from Capex (L-1-K-...)
    e.name AS equipment_name,
    ca.initial_value,
    ca.residual_value,
    ca.useful_life_months,
    e.daily_availability_min,
    ca.category_code,
    -- Расчёт: Амортизация на 1 операционный час
    ROUND(
        (ca.initial_value - ca.residual_value) / 
        (ca.useful_life_months * 30.0 * (e.daily_availability_min / 60.0)), 
        4
    ) AS operational_hourly_cost
FROM equipment e
JOIN capex_assets ca ON ca.unit_id = e.id;
```

---

## Вопросы и Блокеры

1. **Mapping Accuracy:** Я сопоставил основные категории. Если в `Details` встретятся специфические случаи, я буду использовать наиболее подходящий `Sub_Code`.
2. **OpEx vs CapEx:** Транзакции с `Flow type` = 'OpEx' и категорией 'Construction' будут трактоваться как ремонт/обслуживание (OpEx), а не как увеличение стоимости актива.

---

## План Верификации

### Автоматическая (SQL)
```sql
-- 1. Проверка маппинга
SELECT count(*) FROM capex_transactions WHERE category_code IS NULL; -- Должно быть 0

-- 2. Проверка связей
SELECT e.name, v.operational_hourly_cost 
FROM equipment e 
JOIN v_equipment_hourly_cost v ON e.id = v.equipment_uuid;
```
