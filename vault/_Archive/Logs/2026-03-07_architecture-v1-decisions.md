# Решение: Архитектура БД v1 — Четыре модуля

**Дата:** 2026-03-07  
**Агент:** Lead Backend Developer

## Принятые Решения

### Bottleneck: capacity через GENERATED CHECK, не триггер
Отклонили вариант PostgreSQL TRIGGER для проверки capacity. Причина: триггеры сложнее тестировать. Вместо этого — функция `check_equipment_capacity()` + CHECK на уровне приложения.

### Maintenance: задачи попадают в `production_tasks`
Все задачи обслуживания записываются в `production_tasks` с `task_category='maintenance'`. Это единое место для KDS-отображения.

### SYRVE: отдельные таблицы, не расширение `products`
Создаём `nomenclature_products` как мастер-таблицу. Старая `products` остаётся как legacy-слой с `code` TEXT и `syrve_id` UUID, до выполнения Migration 001.

### CapEx: `Transaction_ID` сохраняется как TEXT
Исходный ID из CSV/Sheets неизвестного формата — хранить как TEXT UNIQUE, не пытаться привести к UUID.

### ROI: GENERATED ALWAYS AS для roi_percent
Исключаем ошибки ручного расчёта — процент ROI вычисляется базой данных автоматически.
