# Adaptive Receipt Learning System — Design Spec

**Date**: 2026-04-24
**Author**: Lesia + Claude
**Status**: Approved

## Problem

The receipt OCR system parses and classifies items but doesn't learn from corrections. Every mistake repeats:
- "SIAM MAKRO" != "Makro" — supplier not resolved
- Baking Paper classified as Food instead of OpEx — same error every time
- Weight-based barcodes (chicken, shrimp) are unique per receipt — never match
- Previously approved items show as "New (auto)" on re-parse

With 10+ receipts/week, manual corrections multiply. The system needs to learn silently from the owner's existing workflow.

## Solution: Learning Layer

A correction memory between OCR parsing and the Review Panel. Every user edit is captured as a rule and applied automatically on future receipts.

### Architecture

```
Receipt Image
    ↓
[OCR + LLM] — parse into line items
    ↓
[LEARNING LAYER] — apply corrections:
  • Supplier aliases (resolve name variants)
  • Category overrides (fix flow_type)
  • GS1 barcode decode (extract base item + weight)
  • Known item matching (supplier_catalog enhanced)
    ↓
[Review Panel] — owner sees pre-corrected items
    ↓
[Approve] — save to ledger
    ↓
[DIFF ENGINE] — compare OCR output vs approved payload
    ↓
[correction_rules] — new rules for next time
    ↑
[Post-Approval Triggers] — also learn from DB edits
```

### Key Principle

Zero new UI. The existing Review Panel captures all corrections. The system just stops repeating mistakes.

## Module 1: Approval Diff Engine

The core feedback loop. Runs on every approval.

### Mechanism

1. `fn_approve_receipt` receives `p_payload` (user-edited)
2. Compare against `receipt_inbox.parsed_payload` (original OCR output)
3. For each difference, create a `correction_rule`

### Diff Types

| Change | Example | Rule Created |
|--------|---------|-------------|
| `flow_type` changed | Baking Paper: COGS → OpEx | Category override |
| Supplier resolved | "SIAM MAKRO" → supplier_id matched | Supplier alias |
| `nomenclature_id` added | User linked "New (auto)" item manually | Item→nomenclature mapping in supplier_catalog |
| Name changed | "BKING PAPER" → "Baking Paper" | Name correction (future: improve OCR profile) |
| Item deleted | User removed a line | No rule (ignore) |

### Table: `correction_rules`

```sql
CREATE TABLE correction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL, -- 'category' | 'supplier_alias' | 'name' | 'nomenclature'
  supplier_id UUID REFERENCES suppliers(id),  -- NULL = global rule
  match_pattern TEXT NOT NULL,     -- "baking paper", "SIAM MAKRO", barcode
  match_field TEXT NOT NULL,       -- 'name' | 'barcode' | 'supplier_sku' | 'supplier_name'
  correction_value JSONB NOT NULL, -- {"flow_type":"OpEx"} or {"nomenclature_id":"..."} or {"supplier_id":"..."}
  confidence NUMERIC DEFAULT 1.0,
  times_applied INTEGER DEFAULT 0,
  source TEXT DEFAULT 'approval_diff', -- 'approval_diff' | 'post_approval_trigger' | 'manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_correction_rules_type ON correction_rules(rule_type);
CREATE INDEX idx_correction_rules_pattern ON correction_rules(match_pattern);
CREATE INDEX idx_correction_rules_supplier ON correction_rules(supplier_id);
```

## Module 2: Supplier Aliases

### Problem
`resolveSupplier("SIAM MAKRO")` fails because DB has "Makro". Current word-by-word fallback is fragile.

### Table: `supplier_aliases`

```sql
CREATE TABLE supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE,  -- "SIAM MAKRO", "มากโร", "MAKRO RAWAI"
  source TEXT DEFAULT 'auto',  -- 'auto' | 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_supplier_aliases_alias ON supplier_aliases(alias);
```

### Resolution Order

```
1. supplier_aliases WHERE LOWER(alias) = LOWER(name) → exact hit (fastest)
2. suppliers WHERE name ILIKE '%name%' → substring match
3. Word-by-word fallback (current logic)
4. If resolved via #2 or #3 → auto-insert into supplier_aliases
```

### Auto-Population
- On approval: OCR `supplier_name` + `supplier_name_th` → insert as aliases if not exist
- On receipt re-parse: any new name variant that resolves → save alias

## Module 3: Category Memory

### Problem
LLM classifies by static prompt rules. User corrections don't persist.

### Table: `category_overrides`

```sql
CREATE TABLE category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_pattern TEXT NOT NULL,       -- "baking paper", "garbage bag"
  match_field TEXT DEFAULT 'name',   -- 'name' | 'barcode' | 'supplier_sku'
  supplier_id UUID REFERENCES suppliers(id), -- NULL = global
  flow_type TEXT NOT NULL,           -- 'COGS' | 'OpEx' | 'CapEx'
  category_code INTEGER,             -- 4100, 2100, 1100
  times_applied INTEGER DEFAULT 0,
  source TEXT DEFAULT 'approval_diff',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_category_overrides_pattern ON category_overrides(match_pattern);
```

### Application Priority

```
1. Supplier-specific override (Makro: "baking paper" = OpEx)
2. Global override ("baking paper" = OpEx for all)
3. LLM classification (prompt rules — fallback)
```

### Application Point
In edge function `ocr-receipt`, AFTER LLM parsing and AFTER nomenclature matching, BEFORE saving to `parsed_payload`:

```typescript
async function applyCategoryOverrides(items, supplierId) {
  for (const item of items) {
    const override = await db.from('category_overrides')
      .select('flow_type, category_code')
      .or(`supplier_id.eq.${supplierId},supplier_id.is.null`)
      .ilike('match_pattern', item.translated_name)
      .order('supplier_id', { nullsFirst: false }) // supplier-specific first
      .order('times_applied', { ascending: false })
      .limit(1)
    if (override.data?.[0]) {
      item.category = override.data[0].flow_type === 'COGS' ? 'food'
        : override.data[0].flow_type === 'CapEx' ? 'capex' : 'opex'
      // increment times_applied
    }
  }
}
```

## Module 4: GS1 Weight Barcode Parser

### Problem
Variable-weight items (chicken breast, shrimp, celery) have unique barcodes per receipt because the weight is encoded in the barcode. They never match.

### GS1 Format

```
2 1 00150 10088 0 0005764
│ │                │
│ │                └── Weight/price digits
│ └── Measurement type (1=weight by kg)
└── Prefix "2" = variable weight
```

### Table: `gs1_weight_items`

```sql
CREATE TABLE gs1_weight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_barcode TEXT NOT NULL UNIQUE, -- "2100150100880" (first 13 digits)
  nomenclature_id UUID REFERENCES nomenclature(id),
  supplier_id UUID REFERENCES suppliers(id),
  unit TEXT DEFAULT 'kg',
  divisor INTEGER DEFAULT 1000,  -- weight digits / divisor = weight in unit
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gs1_base_barcode ON gs1_weight_items(base_barcode);
```

### Parsing Logic

```typescript
function parseGS1WeightBarcode(barcode: string) {
  if (!barcode || barcode[0] !== '2' || barcode.length < 13) return null
  const base = barcode.slice(0, 13)
  const weightDigits = barcode.slice(13)
  if (!weightDigits || weightDigits.length === 0) return { base, weight: null }
  const weight = parseInt(weightDigits, 10) / 1000  // default divisor
  return { base, weight }
}
```

### Application Point
In `matchNomenclature()` as Level 0, BEFORE all other checks:

```
if parseGS1WeightBarcode(barcode) → base found:
  search gs1_weight_items by base_barcode
  if found → return nomenclature_id + extracted weight
  else → search supplier_catalog by base_barcode (fallback)
```

### Auto-Learning
On approval, if item has a weight-type barcode + resolved nomenclature_id:
- Extract base barcode
- UPSERT into `gs1_weight_items`

## Module 5: Post-Approval Triggers

### Problem
Corrections happen not just during approval but also via:
- Data health scripts (SQL migrations)
- Manual DB edits (Supabase dashboard)
- `unmatched_items` resolution

### Triggers

```sql
-- Trigger 1: purchase_logs.nomenclature_id changed
CREATE TRIGGER trg_purchase_log_correction
AFTER UPDATE OF nomenclature_id ON purchase_logs
FOR EACH ROW
WHEN (OLD.nomenclature_id IS DISTINCT FROM NEW.nomenclature_id
      AND NEW.nomenclature_id IS NOT NULL)
EXECUTE FUNCTION fn_learn_nomenclature_correction();

-- Trigger 2: expense_ledger.flow_type or category_code changed
CREATE TRIGGER trg_expense_correction
AFTER UPDATE OF flow_type, category_code ON expense_ledger
FOR EACH ROW
WHEN (OLD.flow_type IS DISTINCT FROM NEW.flow_type
      OR OLD.category_code IS DISTINCT FROM NEW.category_code)
EXECUTE FUNCTION fn_learn_category_correction();

-- Trigger 3: unmatched_items resolved
CREATE TRIGGER trg_unmatched_resolved
AFTER UPDATE OF resolved_to ON unmatched_items
FOR EACH ROW
WHEN (OLD.resolved_to IS NULL AND NEW.resolved_to IS NOT NULL)
EXECUTE FUNCTION fn_learn_unmatched_resolution();
```

Each trigger function creates/updates entries in `correction_rules` and `supplier_catalog`.

## Implementation Phases

| Phase | Scope | Tables | Impact |
|-------|-------|--------|--------|
| **P1** | Approval Diff Engine + Category Memory | `correction_rules`, `category_overrides` | Highest — stops repeating classification errors |
| **P2** | Supplier Aliases | `supplier_aliases` | High — instant supplier resolution |
| **P3** | GS1 Weight Barcode Parser | `gs1_weight_items` | High — weight items finally match |
| **P4** | Post-Approval Triggers | 3 triggers | Medium — learns from DB edits |

Each phase is independently deployable and valuable.

## Expected Learning Curve

- **Today**: ~80% items need manual correction
- **Week 1** (~10 receipts): ~40% corrections (suppliers learned, common items learned)
- **Week 2** (~20 receipts): ~15% corrections (most categories stable)
- **Month 1** (~40 receipts): ~5% corrections (only truly new items)
- **Month 2+**: ~0-2% corrections (steady state, only new products)

## Non-Goals

- No new admin UI for managing rules (rules are auto-created)
- No ML/embedding-based matching (deterministic rules are sufficient at this scale)
- No supplier template engine (LLM handles format variation well enough)
- No changes to the Review Panel UI (it already captures everything needed)
