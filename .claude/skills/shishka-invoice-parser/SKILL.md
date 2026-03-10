---
name: shishka-invoice-parser
description: Parse supplier invoices (PDF or image) for Shishka Healthy Kitchen. Use when the user asks to parse, read, or process a PDF or image invoice from a supplier, extract line items, match ingredients to the nomenclature database, and generate purchase_logs or expense_ledger INSERT statements. Also triggers on "invoice", "nakladnaya", "supplier bill", or Thai supplier document mentions.
---

# Shishka Invoice Parser

Parse supplier invoices (PDF/image) and route entries to the correct table:
- **Food items** (RAW/PF ingredients) → `purchase_logs`
- **Non-food items** (services, utilities, rent, equipment, etc.) → `expense_ledger`

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
| **Total Price** | Yes | Total for this line (THB or other currency) |
| **Currency** | No | Defaults to THB unless explicitly stated otherwise |

### Step 3: Classify Items — Food vs Non-Food

For each line item, determine the **routing target**:

| Item Type | Target Table | Examples |
|-----------|-------------|----------|
| **Food ingredient** (RAW/PF match exists in nomenclature) | `purchase_logs` | Pumpkin, coconut milk, chicken breast |
| **Non-food** (no nomenclature match, or service/utility/equipment) | `expense_ledger` | Rent, electricity, cleaning supplies, napkins, equipment repair |

**Decision logic:**
1. Attempt fuzzy match against `nomenclature` (Step 4).
2. If a match is found → route to `purchase_logs`.
3. If no match is found → ask user: "Is this a food ingredient (create new RAW item) or a non-food expense?"
4. Services, utilities, rent, subscriptions → always `expense_ledger`.

### Step 4: Fuzzy Match to Nomenclature (food items only)

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
   - Have no match (suggest creating a new nomenclature entry or routing to expense_ledger)
   - Have ambiguous matches (present top 2-3 candidates)

### Step 5: Match Supplier

1. Query the `suppliers` table:
   ```sql
   SELECT id, name FROM suppliers WHERE is_deleted = false ORDER BY name;
   ```

2. Match the extracted supplier name. If no match found, suggest creating a new supplier first.

### Step 6: Match Financial Category (expense_ledger items only)

For items routed to `expense_ledger`, determine the financial category:

1. Query `fin_categories` and `fin_sub_categories`:
   ```sql
   SELECT code, name FROM fin_categories ORDER BY code;
   SELECT sub_code, category_code, name FROM fin_sub_categories ORDER BY sub_code;
   ```

2. Suggest the best category match based on item description.
3. Ask the user to confirm or select the correct category.

### Step 7: Generate SQL INSERTs

#### For food items → `purchase_logs`:

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
> The `purchase_logs` table has a trigger (`trg_update_cost_on_purchase`) that automatically updates `nomenclature.cost_per_unit` with the latest `price_per_unit`. This means every INSERT here also updates the system's cost basis.

#### For non-food items → `expense_ledger`:

```sql
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, sub_category_code,
  supplier_id, details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
) VALUES (
  '<invoice_date>',            -- YYYY-MM-DD
  '<OpEx or CapEx>',           -- OpEx for operational, CapEx for equipment/renovation
  <category_code or NULL>,     -- fin_categories.code
  <sub_category_code or NULL>, -- fin_sub_categories.sub_code
  '<supplier_uuid or NULL>',   -- matched supplier
  'Invoice #<number> - <item description>',
  <amount>,                    -- amount in original currency
  '<currency>',                -- THB, USD, etc.
  <exchange_rate>,             -- 1 for THB, actual rate for foreign currency
  '',                          -- paid_by (user fills later)
  'transfer',                  -- default payment method
  'paid'                       -- default status
);
```

> [!note] Multi-currency
> `amount_thb` is a GENERATED column: `amount_original * exchange_rate`. Do NOT include it in INSERT — PostgreSQL computes it automatically.

### Step 8: Present Results

Output a summary table:

| # | Invoice Item | Target | Matched To | Qty | Price/Unit | Total | Currency | Status |
|---|-------------|--------|-----------|-----|-----------|-------|----------|--------|
| 1 | Pumpkin | purchase_logs | RAW-PUMPKIN | 5 kg | 40 | 200 | THB | Matched |
| 2 | Cleaning liquid | expense_ledger | OpEx / Supplies | — | — | 350 | THB | Categorized |
| 3 | Unknown item | ? | ? | 2 L | 150 | 300 | THB | Needs Review |

Then output the complete SQL blocks (grouped by target table) ready for execution.

## Error Handling

- **Unreadable document**: Ask user to provide a clearer scan or manually type the items
- **No nomenclature match**: Ask if it's a food item (create new RAW) or non-food (route to expense_ledger)
- **No supplier match**: Suggest creating a new supplier via Procurement page (`/procurement`)
- **No category match**: List available categories and ask user to select
- **Currency ambiguity**: Default to THB unless explicitly stated otherwise
- **Duplicate detection**: Warn if an invoice with same supplier + date + total already exists
- **Foreign currency**: Prompt user for exchange rate if non-THB and rate is not on the document

## Database Context

- **Supabase Project**: `qcqgtcsjoacuktcewpvo`
- **Food Table**: `purchase_logs` (triggers auto-update `nomenclature.cost_per_unit`)
- **Non-food Table**: `expense_ledger` (multi-currency, `amount_thb` is GENERATED)
- **Lookup Tables**: `nomenclature`, `suppliers`, `fin_categories`, `fin_sub_categories`
- **Storage Bucket**: `receipts` (for receipt image uploads — supplier, bank, tax invoice)
- **Frontend**: Procurement at `/procurement`, Finance at `/finance`
