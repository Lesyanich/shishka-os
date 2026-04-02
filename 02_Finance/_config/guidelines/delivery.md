# Delivery (Grab / LINE MAN) — Специфика парсинга

## Признаки
- Электронный чек / скриншот из приложения
- Логотип Grab, LINE MAN, Robinhood, foodpanda
- Структурированный список позиций
- Отдельная строка Delivery Fee

## Формат строки

Позиции обычно в таблице или списком:
```
name: название товара (английский)
original_name: тайское название если есть
quantity: число
unit: "pcs"
unit_price: цена за штуку
total_price: итого по позиции
barcode: null (обычно нет)
supplier_sku: null
```

## Особенности

1. **Delivery Fee**: Отдельная сумма за доставку → `delivery_fee` в payload (НЕ в items).
2. **Промо-скидки**: Discount / Promo → `discount_total` (отрицательное).
3. **Service Charge**: Если есть → включить в `amount_original`.
4. **Поставщик**: Используй название ресторана/магазина как `supplier_name`, НЕ "Grab".
5. **VAT**: Обычно включён или не применяется. Если нет Tax Invoice → `vat_amount: 0`.

## flow_type

- Еда для кухни → `COGS`, category_code `4100`
- Готовая еда для персонала → `OpEx`, category_code `2100`
- Доставка ингредиентов → `COGS`, delivery_fee отдельно
