# Lazada — Специфика парсинга

## Признаки
- Скриншот из приложения Lazada (не формальный чек)
- Логотип Lazada или URL lazada.co.th
- Order ID: длинный номер (16+ цифр)
- Список товаров с фото, ценами, скидками
- Несколько продавцов (shops) в одном заказе

## Формат строки

Позиции обычно карточками или списком:
```
name: название товара (English)
original_name: тайское название если есть
quantity: число
unit: "pcs"
unit_price: цена за штуку (указанная цена, VAT-inclusive)
total_price: итого по позиции
barcode: null (нет на скриншотах)
supplier_sku: null
brand: бренд если указан
package_weight: вес если указан
```

## Критические правила

### 1. Delivery/Shipping Fees (ГЛАВНАЯ ЛОВУШКА)
На Lazada доставка считается ПО КАЖДОМУ ПРОДАВЦУ отдельно.
- Ищи строки: "Shipping Fee", "ค่าจัดส่ง", "Delivery"
- Каждый продавец (shop) может иметь свой shipping fee
- **СУММИРУЙ ВСЕ shipping fees** → `delivery_fee` в payload
- Если shipping fee = 0 / Free → `delivery_fee: 0`
- **Формула:** SUM(items) − discount + delivery_fee = amount_original

### 2. VAT всегда включён
Цены на Lazada — **VAT-inclusive**. НЕ добавляй VAT сверху!
```
vat_amount = amount_original × 7 / 107
```
Если на скрине есть отдельная строка VAT — используй напечатанное значение.

### 3. Скидки и ваучеры
На Lazada бывают несколько типов скидок:
- **Seller discount** (скидка продавца) — обычно уже отражена в цене товара
- **Lazada voucher** — код скидки, отдельная строка
- **Coins discount** — оплата монетами Lazada
- **Bundle deal** — скидка за комплект
- ВСЕ скидки суммируй → `discount_total` (отрицательное число)

### 4. Несколько продавцов
Один заказ Lazada может содержать товары от разных продавцов (shops).
- Каждый shop = отдельный блок на скриншоте
- У каждого свой shipping fee
- **Все товары из одного заказа = один чек** (один payload)
- `supplier_name`: "Lazada" (платформа), НЕ отдельные shop names
- Shop names → `raw_parse.shops[]`

### 5. Order ID
- Order ID (16+ цифр) → `invoice_number`
- Если несколько order в одном скрине → парсить как отдельные чеки

### 6. Tax Invoice
- Lazada screenshots НЕ являются tax invoice
- Если CEO говорит что tax invoice будет позже → `_tax_reminder: true`
- `has_tax_invoice: false` в payload

## Арифметическая верификация

```
□ SUM(all item total_price) = items_subtotal
□ items_subtotal − discount_total + delivery_fee = amount_original
□ vat_amount = amount_original × 7 / 107 (±1 THB)
```

**Типичная ошибка:** забыть delivery fee → diff = сумма shipping fees.
**Вторая ошибка:** добавить VAT сверху вместо извлечения из inclusive цены.

## Поставщик

- `supplier_name`: "Lazada"
- Supplier ID: `d0cdee66-9aee-43c9-9764-d3b8d67e1b6c` (уже в БД)

## flow_type

- Кухонное оборудование / техника > 2000 THB → `CapEx` + `read_guideline("capex")`
- Кухонные принадлежности, контейнеры, мелочь → `OpEx`, category_code `2200`
- Ингредиенты / продукты → `COGS`, category_code `4100`
- Cleaning / хозтовары → `OpEx`, category_code `2300`

## Payment method

- Обычно `transfer` (банковский перевод) или `card` (кредитная карта)
- Ищи: "Payment Method", "วิธีชำระเงิน" на скриншоте
