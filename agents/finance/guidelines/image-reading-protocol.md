# Image Reading Protocol — Как читать фото чека

**Выполняй этот протокол КАЖДЫЙ раз при чтении фото.**

## ШАГ 1: Определи тип и формат

| Тип чека | Признаки | Формат данных |
|----------|----------|---------------|
| Makro | Логотип Makro, "SIAM MAKRO", колонки с артикулами | 6 колонок: Article / Barcode / Description / Qty / Price / Amount |
| Big C / Lotus | Логотип сети | Похож на Makro, другой layout |
| Рынок / мелкие | Рукописный или термопринтер | Свободный формат: название — цена |
| Tax Invoice | "TAX INVOICE" / "ใบกำกับภาษี" | Таблица с VAT, номером счёта |
| Delivery | Электронный чек Grab/LINE | Структурированный список |

## ШАГ 2: Считай HEADER

Извлеки ВСЕ данные из шапки:
- **Название поставщика** (English И Thai, если есть оба)
- **Адрес** → raw_parse
- **Телефон** → raw_parse
- **Tax ID** → raw_parse
- **Номер чека / invoice** → invoice_number
- **Дата** → transaction_date (формат YYYY-MM-DD)
  - ⚠️ Buddhist Era: год 2569 = 2026 CE. Вычитай 543!
- **Кассир / Cashier** → raw_parse
- **Номер карты** → raw_parse.member_card

## ШАГ 3: Считай КАЖДУЮ строку товара

Загрузи специфичный гайдлайн поставщика для деталей формата (makro.md, market-small.md и т.д.).

Общие правила:
- Каждая строка = один товар с qty, unit_price, total_price
- Если описание на 2 строках (Thai + English) = ОДНА позиция
- **QTY × PRICE = AMOUNT** — проверяй сразу
- Скидка (DISC) = отрицательная сумма
- Возврат (RETURN) = отрицательное quantity

## ШАГ 4: Считай FOOTER

- **Subtotal** — сумма всех Amount (до скидки)
- **Discount** — MEM.DISC, SAVE, промо-скидки
- **VAT 7%** — обычно включён (VAT-inclusive): `vat = total × 7 / 107`
- **TOTAL / Grand Total** → `amount_original`
- **Payment method**: CASH / CARD / TRANSFER → `payment_method`
- **Change** (сдача) — в raw_parse
