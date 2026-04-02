# Makro Receipt — Специфика парсинга

## Формат строки (6 колонок)

```
Колонка 1: Article (6 цифр)     → supplier_sku
Колонка 2: Barcode (8-13 цифр)  → barcode
Колонка 3: Description           → name (EN) / original_name (Thai)
Колонка 4: Qty                   → quantity
Колонка 5: Price (за единицу)    → unit_price
Колонка 6: Amount (итого)        → total_price
```

## Критические правила чтения

1. **Две строки на одну позицию**: Thai название сверху, English снизу — это ОДНА позиция, НЕ две!

2. **QTY × PRICE = AMOUNT**: Если Qty > 1, Price и Amount — разные числа. Проверь сразу.

3. **Одинаковые товары на разных строках**: Makro может печатать 2 одинаковых товара как 2 отдельные строки (каждая Qty=1). Не объединяй! Запиши как 2 отдельных item.

4. **MEM.DISC / MBR DISC**: Скидка по карте Makro. Число со знаком минус → `discount_total` (например, -134.00).

5. **Возврат / RETURN**: Строка с отрицательной суммой = возврат. quantity отрицательное.

6. **Маркер "T"**: Буква "T" рядом с суммой = taxable item (VAT 7%).

## Header — что искать

- "SIAM MAKRO PUBLIC COMPANY LIMITED" / "สยามแม็คโคร"
- TAX ID: 0107536000269
- Branch: номер и название
- Receipt No: формат XXX-YYYY-MM-NNNNNNN
- Дата: DD/MM/BBBB (Buddhist Era — вычитай 543)
- Номер карты Makro → raw_parse.member_card

## Footer — что искать

- SUBTOTAL: сумма всех Amount
- MEM.DISC: скидка (отрицательная)
- TOTAL: итого к оплате → amount_original
- VAT 7% (incl): VAT уже включён в цену
- CASH / CARD: способ оплаты

## VAT

VAT всегда включён (VAT-inclusive):
```
vat_amount = amount_original × 7 / 107
```

## Типичный формат

```
┌──────────────────────────────────────────────────────────┐
│  SIAM MAKRO PUBLIC COMPANY LIMITED                       │
│  TAX ID: 0107536000269                                   │
│  Branch: 048 — Samui                                     │
│  Date: 02/04/2569    Time: 14:23                         │
│  Receipt No: 048-2026-04-0012345                         │
├──────────────────────────────────────────────────────────┤
│  Art.    Barcode        Description        Qty  Price Amt│
│  246823  8858651601357  พัดลมตั้งพื้น           1  890  890│
│                         SHARP FAN PJ-BL161              │
├──────────────────────────────────────────────────────────┤
│  SUBTOTAL:                                      4,470.00│
│  MEM.DISC:                                       -134.00│
│  TOTAL:                                         4,336.00│
│  VAT 7% (incl):                                   283.55│
│  CARD:                                          4,336.00│
└──────────────────────────────────────────────────────────┘
```
