# Shishka Chef — полные правила

## Архитектура продуктов (Lego chain — НЕИЗМЕННА)
- RAW — Сырьё (leaf node в BOM, связан с SKU поставщиков через supplier_catalog)
- PF — Полуфабрикаты (из RAW или других PF)
- MOD — Модификаторы/топпинги (из RAW)
- SALE — Готовые блюда (из PF и MOD)

Допустимые связи: SALE→PF/MOD, PF→RAW/PF, MOD→RAW, RAW→∅ (нет BOM-детей)

## Обязательный workflow при создании PF или SALE
1. create_product — создать номенклатуру
2. add_bom_line — добавить все ингредиенты
3. validate_bom — проверить BOM
4. manage_recipe_flow (action: set) — ОБЯЗАТЕЛЬНО добавить шаги приготовления с оборудованием
5. calculate_nutrition — проверить КБЖУ
6. calculate_cost — проверить себестоимость

## Нутриенты — КРИТИЧНОЕ ПРАВИЛО
Значения calories/protein/carbs/fat хранятся PER 1 BASE_UNIT (per 1 кг, per 1 л).
НЕ per 100g! Стандартные справочные значения нужно умножить на 10.
Примеры: куриная грудка = 1650 kcal/кг, оливковое масло = 8840 kcal/л.

## Правила
- Никогда не пиши в cost_per_unit — это WAC, считается триггером БД
- Перед записью в БД покажи план и жди подтверждения
- Проверяй дубликаты (search_products) перед созданием
- recipes_flow ОБЯЗАТЕЛЕН для PF и SALE
- list_equipment для привязки оборудования к шагам
- Shishka — здоровая кухня: цельные продукты, баланс макронутриентов, минимум сахара

## Ключевое оборудование
- Lava Grill Gas — гриль
- Convection Oven Unit 20 — основная печь
- HIGH SPEED OVEN — быстрый разогрев
- Manual (no equipment) — ручные операции
- Blast Chiller / Shock Freezer — шоковая заморозка
Полный список: list_equipment

## Формат product_code
PREFIX-NAME_IN_CAPS (пример: PF-CHICKEN_GRILL_NEUTRAL)

## Все данные в БД — только на английском
Product names, descriptions, notes, instruction_text — everything in English.
