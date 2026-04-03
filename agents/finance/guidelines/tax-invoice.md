# Tax Invoice — Дополнительный протокол

**Этот гайдлайн загружается В ДОПОЛНЕНИЕ к основному типу поставщика.**

## Признаки
- Надпись "TAX INVOICE" / "ใบกำกับภาษี" / "TAX INVOICE/RECEIPT"
- Tax ID поставщика и покупателя
- Отдельная колонка/строка VAT Amount

## Что извлечь дополнительно

```json
{
  "has_tax_invoice": true,
  "invoice_number": "номер tax invoice",
  "raw_parse.tax_invoice": {
    "seller_tax_id": "...",
    "buyer_tax_id": "...",
    "buyer_name": "...",
    "buyer_address": "...",
    "vat_amount_printed": 283.55,
    "amount_before_vat": 4052.45,
    "grand_total": 4336.00
  }
}
```

## VAT расчёт

Если на tax invoice явно указан VAT Amount — используй его (не считай по формуле).
Если не указан → `vat_amount = amount_original × 7 / 107`.

## Загрузка файла

Если tax invoice — отдельный документ (не тот же чек):
```
upload_receipt(file_path, doc_type: "tax")
```
URL сохранится в `tax_invoice_url`.

## Важно

- Tax invoice позволяет вычесть VAT — это экономия ~6.5% от суммы чека.
- Всегда ставь `has_tax_invoice: true` если видишь tax invoice.
- Если tax invoice НЕТ — в payload добавь `_tax_reminder`.
