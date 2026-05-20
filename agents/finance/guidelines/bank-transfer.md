# Bank Transfer Slip — Parsing Guideline

## Detection keywords
Match OCR/vision text against any of:
- "Bangkok Bank", "ธนาคารกรุงเทพ"
- "Kasikorn", "K-Bank", "KBank", "ธนาคารกสิกรไทย"
- "SCB", "Siam Commercial Bank", "ธนาคารไทยพาณิชย์"
- "Transaction successful", "Bank reference no."
- "Transfer amount", "โอนเงิน"

## Layout hints per bank

### Bangkok Bank
- Top: bank logo + "Transaction successful"
- Fields: "From" account (sender — always CEO, ignore), "To" (recipient name + account), "Amount", "Bank reference no."
- Date format: DD/MM/YYYY HH:MM

### Kasikorn (K-Bank)
- Green header, "K PLUS" app branding
- Fields: "Transferred to" (recipient), "Amount" (THB), "Reference no.", "Date/Time"

### SCB (Siam Commercial)
- Purple header, "SCB EASY" app branding
- Fields: "To" (name + bank + account), "Amount", "Ref no.", "Date"

## Parsing rules

1. **amount_original** = Transfer amount field (ignore fee if separate line)
2. **supplier_name** = Recipient name from "To"/"Transferred to" field.
   Fuzzy-match against `suppliers.name` in DB. If no match, use OCR text verbatim.
3. **transaction_date** = Date from slip (DD/MM/YYYY → YYYY-MM-DD)
4. **invoice_number** = Bank reference number / transaction ID
5. **details** = Use `inbox.notes` (translated to English, ≤60 chars). If empty, use "Bank transfer to {supplier_name}".

## Classification

- **Do NOT default to COGS / 4100.**
- Look up matched supplier's `category_code` from `suppliers` table.
- If supplier has `category_code`:
  - 4100 / 2100 → `flow_type: "COGS"`
  - 1100 / 1200 → `flow_type: "CapEx"`
  - else → `flow_type: "OpEx"`, `category_code: 2100`
- If supplier not found → `flow_type: "OpEx"`, `category_code: 2100` (safe default for contractor/service payments)

## Line items

Bank transfers have **no line items**. Produce a single-item array in the appropriate bucket:

```json
{
  "food_items": [],
  "capex_items": [],
  "opex_items": [
    {
      "name": "Bank transfer to Richi Construction",
      "quantity": 1,
      "unit_price": 4000,
      "total_price": 4000
    }
  ]
}
```

Place the single entry in `capex_items` if CapEx, `opex_items` if OpEx, `food_items` if COGS.

## Warnings

- Always push `_warnings: ["Bank transfer slip — no line items, single-entry classification"]`
- If supplier not matched: `_warnings: ["Supplier not found in DB — defaulting to OpEx/2100"]`
