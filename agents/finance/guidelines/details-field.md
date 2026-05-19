# `details` field hygiene

The `expense_ledger.details` field is the only freeform "what is this" column.
Everything else lives in its own column already:

| dedicated column | do NOT repeat in `details` |
|---|---|
| `supplier_id` / supplier name | "Lazada — …", "Makro: …" |
| `transaction_date` | dates |
| `invoice_number` | order IDs (Lazada 16-digit, Makro receipt #) |
| `amount_original`, `currency`, `vat_amount` | THB sums, VAT figures |
| `category_code`, `sub_category_code`, `flow_type` | "OpEx / CapEx" tags, "(under 2k)" classification notes |

## Rule (CEO-ratified 2026-05-19)

`details` answers ONE question: **что было куплено** — item name, max ~60 chars.

### Good
- `Khairat Alsham Green Zaatar 400g ×2`
- `Japanese Bread Flour 22.5kg`
- `Mixed food + baking forms (18 items)`
- `Loyverse POS (printer + tablet + paper)`
- `Tahini + Anchor Milk Powder`

### Bad (real examples cleaned up that same day)
- ~~`Lazada 1104159323876521 - Khairat Alsham Green Zaatar 400g x2 (AL JAZEERA shop)`~~ — duplicates supplier + invoice + adds noise
- ~~`Lazada — OCR+gemini-flash`~~ — tells nothing about the purchase
- ~~`Lazada 1097166997876521 — Coffee Roaster (under 2k)`~~ — classification chatter, supplier+invoice noise
- ~~`Lazada 1085776016776521 — mega mixed — most food, some OpEx forms (treated as food bulk)`~~ — too long + classification noise

## When building `fn_approve_receipt` payloads

```jsonc
{
  "supplier_id": "...",            // supplier lives here
  "invoice_number": "...",         // order ID lives here
  "transaction_date": "2026-05-18", // date lives here
  "details": "Wheat Bran 1kg",     // ← just the WHAT, max 60 chars
  ...
}
```

For multi-shop / multi-parcel orders, summarize across shops, do not list each
shop. Shop names belong in `comments` if anywhere, not `details`.
