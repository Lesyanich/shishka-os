# CapEx Protocol — Оборудование

## Когда применять
Чек содержит оборудование, мебель, IT-технику или другие основные средства.
Обычно: единичный предмет > 2000 THB.

## Классификация

| Тип | category_code | Примеры |
|-----|---------------|---------|
| Оборудование кухни | 1100 | Вентиляторы, печь, холодильник, миксер |
| Ремонт помещения | 1200 | Стройматериалы, подрядчики |
| IT оборудование | 1100 | Компьютер, планшет, POS-терминал |

`flow_type: "CapEx"`

## capex_items — формат

```json
{
  "capex_items": [
    {
      "name": "SHARP Fan PJ-BL161-BK",
      "quantity": 1,
      "unit_price": 890,
      "total_price": 890
    }
  ]
}
```

## Правила

1. **Полное название с моделью**: "SHARP PJ-BL161-BK", НЕ просто "вентилятор".
2. **Каждый предмет = отдельная строка** (даже если одинаковые).
3. **Бренд и модель** → в `name`.

## Post-processing подсказка

После парсинга добавь в payload:
```json
{
  "_capex_note": "После approve рекомендуется: manage_capex_assets(create) для постановки на баланс"
}
```

Параметры для будущего create:
- `useful_life_months`: 60 (default, 5 лет)
- `residual_value`: 0 (default)
- `equipment_category`: oven / refrigeration / cooking / prep / beverage / fermentation / storage / service / infrastructure
