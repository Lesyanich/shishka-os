---
name: shishka-invoice-parser
description: Parse supplier invoices (PDF or image) for Shishka Healthy Kitchen. Use when the user asks to parse, read, or process a PDF or image invoice from a supplier, extract line items, match ingredients to the nomenclature database, and generate purchase_logs INSERT statements. Also triggers on "invoice", "nakladnaya", "supplier bill", or Thai supplier document mentions.
---

# Shishka Invoice Parser

Parse supplier invoices (PDF/image) and convert them into structured `purchase_logs` entries for the Shishka OS Procurement module.

## When to Use

- User provides a PDF or image of a supplier invoice/receipt
- User mentions "parse invoice", "nakladnaya", "supplier bill", "import invoice"
- User wants to log purchases from a physical document into the system

## Workflow

### Step 1: Read the Document

1. If the input is a **PDF**, use the `pdf` skill or the `Read` tool to extract text content.
2. If the input is an **image** (JPG/PNG), use the `Read` tool to visually parse it (Claude is multimodal).
3. If OCR quality is poor, ask the user for clarification on unreadable fields.

### Step 2: Extract Structured Data

Extract the following fields from the document:

| Field | Required | Notes |
|-------|----------|-------|
| **Supplier Name** | Yes | Company name from the header/stamp |
| **Invoice Date** | Yes | Date of the document (Thai/ISO format) |
| **Invoice Number** | No | Reference number if present |
| **Line Items** | Yes | See table below |

For each line item, extract:

| Field | Required | Notes |
|-------|----------|-------|
| **Item Name** | Yes | As written on the invoice (may be in Thai) |
| **Quantity** | Yes | Numeric value + unit (kg, L, pcs, etc.) |
| **Unit Price** | No | Price per unit if listed |
| **Total Price** | Yes | Total for this line (THB) |

### Step 3: Fuzzy Match to Nomenclature

1. Query the `nomenclature` table in Supabase for RAW and PF items:
   ```sql
   SELECT id, product_code, name, base_unit, cost_per_unit
   FROM nomenclature
   WHERE product_code LIKE 'RAW-%' OR product_code LIKE 'PF-%'
   ORDER BY name;
   ```

2. For each extracted line item, find the best match by name:
   - Exact match (case-insensitive)
   - Partial match (item name contains nomenclature name or vice versa)
   - Transliteration match (Thai name to English RAW-code)

3. Present matches to the user for confirmation. Flag any items that:
   - Have no match (suggest creating a new nomenclature entry)
   - Have ambiguous matches (present top 2-3 candidates)

### Step 4: Match Supplier

1. Query the `suppliers` table:
   ```sql
   SELECT id, name FROM suppliers WHERE is_deleted = false ORDER BY name;
   ```

2. Match the extracted supplier name. If no match found, suggest creating a new supplier first.

### Step 5: Generate SQL INSERT

For each confirmed line item, generate an INSERT statement for `purchase_logs`:

```sql
INSERT INTO purchase_logs (nomenclature_id, supplier_id, quantity, price_per_unit, total_price, invoice_date, notes)
VALUES (
  '<nomenclature_uuid>',   -- matched nomenclature.id
  '<supplier_uuid>',       -- matched supplier.id
  <quantity>,              -- extracted quantity
  <total_price / quantity>, -- calculated price per unit
  <total_price>,           -- extracted total
  '<invoice_date>',        -- extracted date (YYYY-MM-DD)
  'Invoice #<number> - <original item name from document>'
);
```

> [!important] SSoT Reminder
> The `purchase_logs` table has a trigger (`trg_update_cost_on_purchase`) that automatically updates `nomenclature.cost_per_unit` with the latest `price_per_unit`. This means every INSERT here also updates the system's cost basis — no manual cost updates needed.

### Step 6: Present Results

Output a summary table:

| # | Invoice Item | Matched To | Qty | Price/Unit | Total | Status |
|---|-------------|-----------|-----|-----------|-------|--------|
| 1 | ... | RAW-PUMPKIN | 5 kg | 40 THB | 200 THB | Matched |
| 2 | ... | ? | 2 L | 150 THB | 300 THB | No Match |

Then output the complete SQL block ready for execution.

## Error Handling

- **Unreadable document**: Ask user to provide a clearer scan or manually type the items
- **No nomenclature match**: Suggest creating a new RAW item first via BOM Hub (`/bom`)
- **No supplier match**: Suggest creating a new supplier via Procurement page (`/procurement`)
- **Currency ambiguity**: Default to THB unless explicitly stated otherwise
- **Duplicate detection**: Warn if an invoice with the same supplier + date + total already exists in purchase_logs

## Database Context

- **Supabase Project**: `qcqgtcsjoacuktcewpvo`
- **Key Tables**: `purchase_logs`, `nomenclature`, `suppliers`
- **Auto-cost Trigger**: `trg_update_cost_on_purchase` → `fn_update_cost_on_purchase()`
- **Frontend**: Procurement page at `/procurement` (PurchaseForm + PurchaseHistory)
