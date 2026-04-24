# Adaptive Receipt Learning System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the receipt OCR system self-learning — every user correction is captured and applied automatically on future receipts.

**Architecture:** A Learning Layer between OCR parsing and the Review Panel. Four modules: supplier aliases, category overrides, GS1 weight barcode parser, and an approval diff engine that extracts correction rules from the diff between OCR output and approved payload. All modules share a `correction_rules` table and feed from the same approval flow.

**Tech Stack:** PostgreSQL (migrations), Deno (Supabase Edge Functions), TypeScript

**Spec:** `docs/superpowers/specs/2026-04-24-adaptive-receipt-learning-design.md`

---

### Task 1: Database Migration — Create Learning Tables

**Files:**
- Create: `services/supabase/migrations/150_adaptive_learning_tables.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 150: Adaptive Receipt Learning System tables
-- Tables: supplier_aliases, category_overrides, gs1_weight_items, correction_rules
-- ============================================================

-- ── supplier_aliases: instant supplier name resolution ──
CREATE TABLE IF NOT EXISTS public.supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT DEFAULT 'auto',  -- 'auto' | 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_aliases_alias_lower
  ON public.supplier_aliases (LOWER(alias));

CREATE INDEX IF NOT EXISTS idx_supplier_aliases_supplier
  ON public.supplier_aliases (supplier_id);

-- ── category_overrides: learned classification corrections ──
CREATE TABLE IF NOT EXISTS public.category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_pattern TEXT NOT NULL,
  match_field TEXT DEFAULT 'name',  -- 'name' | 'barcode' | 'supplier_sku'
  supplier_id UUID REFERENCES public.suppliers(id),
  flow_type TEXT NOT NULL,          -- 'COGS' | 'OpEx' | 'CapEx'
  category_code INTEGER,
  times_applied INTEGER DEFAULT 0,
  source TEXT DEFAULT 'approval_diff',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_overrides_pattern
  ON public.category_overrides (LOWER(match_pattern));

-- ── gs1_weight_items: variable-weight barcode → base item mapping ──
CREATE TABLE IF NOT EXISTS public.gs1_weight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_barcode TEXT NOT NULL UNIQUE,
  nomenclature_id UUID REFERENCES public.nomenclature(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  unit TEXT DEFAULT 'kg',
  divisor INTEGER DEFAULT 1000,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gs1_base_barcode
  ON public.gs1_weight_items (base_barcode);

-- ── correction_rules: generic learning rules from approval diffs ──
CREATE TABLE IF NOT EXISTS public.correction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL,        -- 'category' | 'supplier_alias' | 'name' | 'nomenclature'
  supplier_id UUID REFERENCES public.suppliers(id),
  match_pattern TEXT NOT NULL,
  match_field TEXT NOT NULL,      -- 'name' | 'barcode' | 'supplier_sku' | 'supplier_name'
  correction_value JSONB NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  times_applied INTEGER DEFAULT 0,
  source TEXT DEFAULT 'approval_diff',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correction_rules_type
  ON public.correction_rules (rule_type);
CREATE INDEX IF NOT EXISTS idx_correction_rules_pattern
  ON public.correction_rules (LOWER(match_pattern));

-- ── Seed existing supplier names as aliases ──
INSERT INTO public.supplier_aliases (supplier_id, alias, source)
SELECT id, name, 'manual' FROM public.suppliers
WHERE name IS NOT NULL AND name <> ''
ON CONFLICT DO NOTHING;

-- ── Migration log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '150_adaptive_learning_tables.sql',
  'claude-code',
  'Adaptive learning: supplier_aliases, category_overrides, gs1_weight_items, correction_rules tables'
) ON CONFLICT (filename) DO NOTHING;
```

- [ ] **Step 2: Apply migration to production**

Run:
```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w) && psql "$DB_URL" -f services/supabase/migrations/150_adaptive_learning_tables.sql
```
Expected: `CREATE TABLE` x4, `CREATE INDEX` x6, `INSERT` for seed data

- [ ] **Step 3: Commit**

```bash
git add services/supabase/migrations/150_adaptive_learning_tables.sql
git commit -m "feat(db): adaptive learning tables — supplier_aliases, category_overrides, gs1_weight_items, correction_rules"
```

---

### Task 2: GS1 Weight Barcode Parser

**Files:**
- Create: `services/supabase/functions/_shared/gs1.ts`
- Modify: `services/supabase/functions/_shared/nomenclature.ts` (add Level 0 to `matchNomenclature`)

- [ ] **Step 1: Create GS1 parser module**

Write `services/supabase/functions/_shared/gs1.ts`:

```typescript
import { db } from "./supabase.ts"

export interface GS1ParseResult {
  base: string    // first 13 digits — the stable item identifier
  weight: number | null  // extracted weight in kg (or null if not parseable)
}

/**
 * Parse a GS1 variable-weight barcode.
 * Format: prefix "2" + item code (12 digits) + weight/price suffix
 * Example: "210015010088000005764" → base "2100150100880", weight 5.764 kg
 */
export function parseGS1WeightBarcode(barcode: string): GS1ParseResult | null {
  if (!barcode || barcode.length < 13) return null
  if (barcode[0] !== "2") return null
  // Standard GS1 weight barcodes are 13+ digits starting with "2"
  // Only treat as weight barcode if there are extra digits beyond 13
  if (barcode.length <= 13) return null

  const base = barcode.slice(0, 13)
  const weightDigits = barcode.slice(13)
  const weightRaw = parseInt(weightDigits, 10)
  if (isNaN(weightRaw)) return { base, weight: null }
  const weight = weightRaw / 1000  // default: grams → kg
  return { base, weight }
}

/**
 * Look up a GS1 base barcode in gs1_weight_items table.
 * Returns nomenclature_id if the base item is known.
 */
export async function matchGS1WeightItem(
  baseBarcode: string,
): Promise<{ nomenclature_id: string | null; sku_id: string | null; description: string | null }> {
  const { data } = await db
    .from("gs1_weight_items")
    .select("nomenclature_id, description")
    .eq("base_barcode", baseBarcode)
    .limit(1)
  if (data?.[0]?.nomenclature_id) {
    return { nomenclature_id: data[0].nomenclature_id, sku_id: null, description: data[0].description }
  }
  // Fallback: search supplier_catalog by base barcode
  const { data: scMatch } = await db
    .from("supplier_catalog")
    .select("nomenclature_id, sku_id")
    .eq("barcode", baseBarcode)
    .not("nomenclature_id", "is", null)
    .order("match_count", { ascending: false })
    .limit(1)
  if (scMatch?.[0]?.nomenclature_id) {
    return { nomenclature_id: scMatch[0].nomenclature_id, sku_id: scMatch[0].sku_id, description: null }
  }
  return { nomenclature_id: null, sku_id: null, description: null }
}
```

- [ ] **Step 2: Add Level 0 (GS1) to matchNomenclature**

In `services/supabase/functions/_shared/nomenclature.ts`, add import at top:

```typescript
import { parseGS1WeightBarcode, matchGS1WeightItem } from "./gs1.ts"
```

Then add Level 0 at the very beginning of `matchNomenclature`, before the `if (item.barcode)` block:

```typescript
  // Level 0: GS1 variable-weight barcode (prefix "2", >13 digits)
  if (item.barcode) {
    const gs1 = parseGS1WeightBarcode(item.barcode)
    if (gs1) {
      const gs1Match = await matchGS1WeightItem(gs1.base)
      if (gs1Match.nomenclature_id) {
        return { nomenclature_id: gs1Match.nomenclature_id, sku_id: gs1Match.sku_id, confidence: "high" }
      }
    }
  }
```

- [ ] **Step 3: Verify no TypeScript errors**

Run:
```bash
cd services/supabase/functions && deno check ocr-receipt/index.ts 2>&1 || echo "Deno not installed — verify manually on deploy"
```

- [ ] **Step 4: Commit**

```bash
git add services/supabase/functions/_shared/gs1.ts services/supabase/functions/_shared/nomenclature.ts
git commit -m "feat(ocr): GS1 weight barcode parser — Level 0 matching for variable-weight items"
```

---

### Task 3: Supplier Aliases — Resolution Logic

**Files:**
- Modify: `services/supabase/functions/_shared/nomenclature.ts` (rewrite `resolveSupplier` and `resolveSupplierWithProfile`)

- [ ] **Step 1: Rewrite resolveSupplier with alias table**

Replace both functions in `services/supabase/functions/_shared/nomenclature.ts`:

```typescript
export async function resolveSupplier(name: string): Promise<string | null> {
  if (!name) return null
  const resolved = await resolveSupplierWithProfile(name)
  return resolved.id
}

export async function resolveSupplierWithProfile(name: string): Promise<ResolvedSupplier> {
  if (!name) return { id: null, ocr_profile: null }

  // Level 1: Exact alias match (fastest — learned from previous receipts)
  const { data: aliasHit } = await db
    .from("supplier_aliases")
    .select("supplier_id")
    .ilike("alias", name)
    .limit(1)
  if (aliasHit?.[0]?.supplier_id) {
    const { data: sup } = await db
      .from("suppliers")
      .select("id, ocr_profile")
      .eq("id", aliasHit[0].supplier_id)
      .limit(1)
    if (sup?.[0]) return { id: sup[0].id, ocr_profile: sup[0].ocr_profile ?? null }
  }

  // Level 2: Substring match against suppliers.name
  const { data: subHit } = await db
    .from("suppliers")
    .select("id, ocr_profile")
    .ilike("name", `%${name}%`)
    .limit(1)
  if (subHit?.[0]) {
    // Auto-save alias for next time
    await saveAlias(name, subHit[0].id)
    return { id: subHit[0].id, ocr_profile: subHit[0].ocr_profile ?? null }
  }

  // Level 3: Word-by-word fallback
  const words = name.split(/\s+/).filter(w => w.length >= 3)
  for (const word of words) {
    const { data: wordHit } = await db
      .from("suppliers")
      .select("id, ocr_profile")
      .ilike("name", `%${word}%`)
      .neq("name", "")
      .limit(1)
    if (wordHit?.[0]) {
      // Auto-save full alias for next time
      await saveAlias(name, wordHit[0].id)
      return { id: wordHit[0].id, ocr_profile: wordHit[0].ocr_profile ?? null }
    }
  }

  return { id: null, ocr_profile: null }
}

async function saveAlias(alias: string, supplierId: string): Promise<void> {
  try {
    await db.from("supplier_aliases").upsert(
      { alias: alias.trim(), supplier_id: supplierId, source: "auto" },
      { onConflict: "alias" },
    )
  } catch {
    // Non-critical: if alias save fails, resolution still worked
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/supabase/functions/_shared/nomenclature.ts
git commit -m "feat(ocr): supplier alias resolution — auto-learns name variants on match"
```

---

### Task 4: Category Overrides — Apply on Parse

**Files:**
- Create: `services/supabase/functions/_shared/learning.ts`
- Modify: `services/supabase/functions/ocr-receipt/index.ts` (call applyCategoryOverrides after classify)

- [ ] **Step 1: Create learning module**

Write `services/supabase/functions/_shared/learning.ts`:

```typescript
import { db } from "./supabase.ts"

/**
 * Apply learned category overrides to parsed line items.
 * Runs AFTER LLM classification, BEFORE saving to parsed_payload.
 * Overrides LLM category when a matching rule exists.
 */
export async function applyCategoryOverrides(
  lineItems: Record<string, unknown>[],
  supplierId: string | null,
): Promise<number> {
  let overrideCount = 0

  for (const item of lineItems) {
    const name = (item.translated_name as string) || (item.original_name as string) || ""
    if (!name) continue

    // Search for matching override: supplier-specific first, then global
    const query = db
      .from("category_overrides")
      .select("id, flow_type, category_code")
      .ilike("match_pattern", `%${name.slice(0, 60)}%`)

    // Prefer supplier-specific, fall back to global (supplier_id IS NULL)
    if (supplierId) {
      query.or(`supplier_id.eq.${supplierId},supplier_id.is.null`)
    } else {
      query.is("supplier_id", null)
    }

    const { data } = await query
      .order("supplier_id", { nullsFirst: false, ascending: false }) // supplier-specific first
      .order("times_applied", { ascending: false })
      .limit(1)

    if (data?.[0]) {
      const override = data[0]
      const newCat = override.flow_type === "COGS" ? "food"
        : override.flow_type === "CapEx" ? "capex" : "opex"
      const oldCat = (item.category as string) || "food"

      if (oldCat !== newCat) {
        item.category = newCat
        item._override_applied = override.flow_type
        overrideCount++
        // Increment times_applied
        await db.from("category_overrides")
          .update({ times_applied: (override as Record<string, unknown>).times_applied as number + 1 })
          .eq("id", override.id)
      }
    }
  }

  return overrideCount
}

/**
 * Save alias for supplier Thai name (from OCR output).
 */
export async function learnSupplierAlias(
  supplierName: string | null,
  supplierNameTh: string | null,
  supplierId: string | null,
): Promise<void> {
  if (!supplierId) return
  const names = [supplierName, supplierNameTh].filter(
    (n): n is string => !!n && n.trim().length >= 2,
  )
  for (const name of names) {
    try {
      await db.from("supplier_aliases").upsert(
        { alias: name.trim(), supplier_id: supplierId, source: "auto" },
        { onConflict: "alias" },
      )
    } catch {
      // ignore duplicates
    }
  }
}
```

- [ ] **Step 2: Wire into ocr-receipt edge function**

In `services/supabase/functions/ocr-receipt/index.ts`, add import:

```typescript
import { applyCategoryOverrides, learnSupplierAlias } from "../_shared/learning.ts"
```

Then add two calls. After `const supplierId = await resolveSupplier(supplierName)` (line ~190), add:

```typescript
    // ── Auto-learn supplier aliases ──
    await learnSupplierAlias(
      parsed.supplier_name as string | null,
      parsed.supplier_name_th as string | null,
      supplierId,
    )
```

After `classifyItems(lineItems)` call (line ~205), add BEFORE `const flowType = determineFlowType(...)`:

```typescript
    // ── Apply learned category overrides ──
    const overrideCount = await applyCategoryOverrides(lineItems, supplierId)
    if (overrideCount > 0) {
      console.log(`[ocr-receipt] Applied ${overrideCount} category override(s)`)
      // Re-classify after overrides
      const reclassified = classifyItems(lineItems)
      Object.assign({ food_items: reclassified.food_items, capex_items: reclassified.capex_items, opex_items: reclassified.opex_items })
    }
```

Wait — the classifyItems is called once and destructured. We need to restructure slightly. Replace the classify + flowType block:

```typescript
    // ── Apply learned category overrides (before classification) ──
    const overrideCount = await applyCategoryOverrides(lineItems, supplierId)
    if (overrideCount > 0) {
      console.log(`[ocr-receipt] Applied ${overrideCount} category override(s)`)
    }

    // ── Classify items (uses item.category which may have been overridden) ──
    const { food_items, capex_items, opex_items } = classifyItems(lineItems)
    const flowType = determineFlowType(food_items, capex_items, opex_items)
```

This means `applyCategoryOverrides` must run BEFORE `classifyItems`, not after. It modifies `item.category` on each lineItem, and `classifyItems` reads `item.category` to sort into arrays. So the insertion point is between nomenclature matching loop end and `classifyItems` call.

- [ ] **Step 3: Commit**

```bash
git add services/supabase/functions/_shared/learning.ts services/supabase/functions/ocr-receipt/index.ts
git commit -m "feat(ocr): category overrides + supplier alias learning on parse"
```

---

### Task 5: Approval Diff Engine — Learn from User Corrections

**Files:**
- Create: `services/supabase/migrations/151_approval_diff_engine.sql`

- [ ] **Step 1: Write the diff engine as a SQL function**

The diff runs inside `fn_approve_receipt`. It compares the approved payload items against the original `receipt_inbox.parsed_payload`. Write the migration:

```sql
-- ============================================================
-- Migration 151: Approval Diff Engine
-- fn_learn_from_approval — extracts correction rules from the diff
-- between OCR output and approved payload.
-- Called at the end of fn_approve_receipt.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_learn_from_approval(
  p_inbox_id UUID,
  p_approved JSONB,
  p_supplier_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original JSONB;
  v_orig_item JSONB;
  v_appr_item JSONB;
  v_orig_cat TEXT;
  v_appr_cat TEXT;
  v_item_name TEXT;
  v_rules_created INTEGER := 0;
  v_i INTEGER;
  v_base_barcode TEXT;
  v_barcode TEXT;
BEGIN
  -- Get original parsed payload (OCR output before user edits)
  SELECT parsed_payload INTO v_original
  FROM public.receipt_inbox
  WHERE id = p_inbox_id;

  IF v_original IS NULL THEN RETURN 0; END IF;

  -- ── Learn category corrections from food_items ──
  -- Compare original food_items vs approved: if an item moved to opex/capex, learn it
  FOR v_i IN 0..GREATEST(jsonb_array_length(COALESCE(v_original->'line_items', '[]'::jsonb)) - 1, -1)
  LOOP
    v_orig_item := v_original->'line_items'->v_i;
    IF v_orig_item IS NULL THEN CONTINUE; END IF;

    v_item_name := LOWER(COALESCE(v_orig_item->>'translated_name', v_orig_item->>'original_name', ''));
    IF v_item_name = '' THEN CONTINUE; END IF;

    v_orig_cat := COALESCE(v_orig_item->>'category', 'food');

    -- Find this item in approved payload by matching name
    v_appr_cat := NULL;

    -- Check food_items
    FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'food_items', '[]'::jsonb))
    LOOP
      IF LOWER(COALESCE(v_appr_item->>'name', '')) = v_item_name
         OR LOWER(COALESCE(v_appr_item->>'original_name', '')) = LOWER(COALESCE(v_orig_item->>'original_name', '')) THEN
        v_appr_cat := 'food';
        EXIT;
      END IF;
    END LOOP;

    -- Check opex_items
    IF v_appr_cat IS NULL THEN
      FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'opex_items', '[]'::jsonb))
      LOOP
        IF LOWER(COALESCE(v_appr_item->>'description', v_appr_item->>'name', '')) = v_item_name
           OR LOWER(COALESCE(v_appr_item->>'original_name', '')) = LOWER(COALESCE(v_orig_item->>'original_name', '')) THEN
          v_appr_cat := 'opex';
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Check capex_items
    IF v_appr_cat IS NULL THEN
      FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'capex_items', '[]'::jsonb))
      LOOP
        IF LOWER(COALESCE(v_appr_item->>'name', '')) = v_item_name
           OR LOWER(COALESCE(v_appr_item->>'original_name', '')) = LOWER(COALESCE(v_orig_item->>'original_name', '')) THEN
          v_appr_cat := 'capex';
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- If category changed, create override
    IF v_appr_cat IS NOT NULL AND v_orig_cat <> v_appr_cat THEN
      INSERT INTO public.category_overrides (match_pattern, flow_type, supplier_id, source)
      VALUES (
        v_item_name,
        CASE v_appr_cat WHEN 'food' THEN 'COGS' WHEN 'opex' THEN 'OpEx' WHEN 'capex' THEN 'CapEx' END,
        p_supplier_id,
        'approval_diff'
      )
      ON CONFLICT DO NOTHING;  -- don't duplicate if same pattern exists
      v_rules_created := v_rules_created + 1;
    END IF;

    -- ── Learn GS1 weight items ──
    v_barcode := v_orig_item->>'barcode';
    IF v_barcode IS NOT NULL AND LEFT(v_barcode, 1) = '2' AND LENGTH(v_barcode) > 13 THEN
      v_base_barcode := LEFT(v_barcode, 13);
      -- Find nomenclature_id from approved food_items by matching barcode prefix
      FOR v_appr_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_approved->'food_items', '[]'::jsonb))
      LOOP
        IF (v_appr_item->>'nomenclature_id') IS NOT NULL
           AND LEFT(COALESCE(v_appr_item->>'barcode', ''), 13) = v_base_barcode THEN
          INSERT INTO public.gs1_weight_items (base_barcode, nomenclature_id, supplier_id, description)
          VALUES (
            v_base_barcode,
            (v_appr_item->>'nomenclature_id')::UUID,
            p_supplier_id,
            v_appr_item->>'name'
          )
          ON CONFLICT (base_barcode) DO UPDATE SET
            nomenclature_id = EXCLUDED.nomenclature_id,
            description = EXCLUDED.description;
          v_rules_created := v_rules_created + 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_rules_created;
END;
$$;

COMMENT ON FUNCTION public.fn_learn_from_approval(UUID, JSONB, UUID)
  IS 'Extract correction rules from diff between OCR output and approved payload. Creates category_overrides and gs1_weight_items entries.';

-- ── Migration log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '151_approval_diff_engine.sql',
  'claude-code',
  'fn_learn_from_approval: extracts category overrides and GS1 weight items from approval diffs'
) ON CONFLICT (filename) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

Run:
```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w) && psql "$DB_URL" -f services/supabase/migrations/151_approval_diff_engine.sql
```
Expected: `CREATE FUNCTION`, `COMMENT`, `INSERT 0 1`

- [ ] **Step 3: Commit**

```bash
git add services/supabase/migrations/151_approval_diff_engine.sql
git commit -m "feat(db): fn_learn_from_approval — approval diff engine extracts correction rules"
```

---

### Task 6: Wire Diff Engine into fn_approve_receipt

**Files:**
- Create: `services/supabase/migrations/152_approve_receipt_v15_learning.sql`

- [ ] **Step 1: Write migration that adds learning call to fn_approve_receipt**

At the end of `fn_approve_receipt` (before the RETURN statement), add a call to `fn_learn_from_approval`. This is a minimal migration that wraps the existing function:

```sql
-- ============================================================
-- Migration 152: Wire fn_learn_from_approval into fn_approve_receipt
-- Adds learning call + supplier alias auto-save at end of approval
-- ============================================================

-- Add a wrapper that calls learn after approve
CREATE OR REPLACE FUNCTION public.fn_approve_receipt_with_learning(
  p_payload JSONB,
  p_inbox_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_supplier_id UUID;
  v_supplier_name TEXT;
  v_rules_learned INTEGER;
BEGIN
  -- Run the existing approval logic
  v_result := public.fn_approve_receipt(p_payload);

  -- If approval failed, return immediately
  IF NOT (v_result->>'ok')::BOOLEAN THEN
    RETURN v_result;
  END IF;

  -- Extract supplier_id for learning
  v_supplier_name := p_payload->>'supplier_name';
  IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE name ILIKE v_supplier_name
    LIMIT 1;

    -- If not found by exact name, try aliases
    IF v_supplier_id IS NULL THEN
      SELECT supplier_id INTO v_supplier_id
      FROM public.supplier_aliases
      WHERE LOWER(alias) = LOWER(v_supplier_name)
      LIMIT 1;
    END IF;

    -- Auto-save supplier alias
    IF v_supplier_id IS NOT NULL THEN
      INSERT INTO public.supplier_aliases (supplier_id, alias, source)
      VALUES (v_supplier_id, v_supplier_name, 'auto')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Run learning if we have inbox_id
  IF p_inbox_id IS NOT NULL AND v_supplier_id IS NOT NULL THEN
    v_rules_learned := public.fn_learn_from_approval(p_inbox_id, p_payload, v_supplier_id);
    v_result := v_result || jsonb_build_object('rules_learned', v_rules_learned);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_approve_receipt_with_learning(JSONB, UUID)
  IS 'Wrapper: runs fn_approve_receipt then fn_learn_from_approval. Pass inbox_id to enable learning.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '152_approve_receipt_v15_learning.sql',
  'claude-code',
  'fn_approve_receipt_with_learning: wrapper that adds learning to approval flow'
) ON CONFLICT (filename) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

Run:
```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w) && psql "$DB_URL" -f services/supabase/migrations/152_approve_receipt_v15_learning.sql
```

- [ ] **Step 3: Update MCP finance approve_receipt tool to use the new function**

Find the approve-receipt tool in `services/mcp-finance/src/tools/approve-receipt.ts` and update the RPC call from `fn_approve_receipt` to `fn_approve_receipt_with_learning`, passing `inbox_id` as the second parameter.

Read the file first, then change the `.rpc("fn_approve_receipt", ...)` call to:
```typescript
.rpc("fn_approve_receipt_with_learning", { p_payload: payload, p_inbox_id: inboxId })
```

This requires the approve tool to receive `inbox_id` — check if it already does from the InboxReviewPanel's `onApprove` callback.

- [ ] **Step 4: Commit**

```bash
git add services/supabase/migrations/152_approve_receipt_v15_learning.sql services/mcp-finance/src/tools/approve-receipt.ts
git commit -m "feat(finance): wire approval diff engine — system learns from every approval"
```

---

### Task 7: Post-Approval Triggers

**Files:**
- Create: `services/supabase/migrations/153_post_approval_triggers.sql`

- [ ] **Step 1: Write triggers migration**

```sql
-- ============================================================
-- Migration 153: Post-approval learning triggers
-- Learn from DB corrections (data health, manual edits, unmatched resolution)
-- ============================================================

-- ── Trigger function: learn from purchase_logs nomenclature reassignment ──
CREATE OR REPLACE FUNCTION public.fn_learn_nomenclature_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If barcode exists, update supplier_catalog and correction_rules
  IF NEW.barcode IS NOT NULL AND NEW.barcode <> '' THEN
    -- Update supplier_catalog with new nomenclature_id
    UPDATE public.supplier_catalog
    SET nomenclature_id = NEW.nomenclature_id,
        updated_at = now()
    WHERE barcode = NEW.barcode
      AND (nomenclature_id IS NULL OR nomenclature_id = OLD.nomenclature_id);

    -- Create correction rule
    INSERT INTO public.correction_rules (rule_type, supplier_id, match_pattern, match_field, correction_value, source)
    VALUES (
      'nomenclature',
      NEW.supplier_id,
      NEW.barcode,
      'barcode',
      jsonb_build_object('nomenclature_id', NEW.nomenclature_id),
      'post_approval_trigger'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_log_correction
AFTER UPDATE OF nomenclature_id ON public.purchase_logs
FOR EACH ROW
WHEN (OLD.nomenclature_id IS DISTINCT FROM NEW.nomenclature_id
      AND NEW.nomenclature_id IS NOT NULL)
EXECUTE FUNCTION public.fn_learn_nomenclature_correction();

-- ── Trigger function: learn from expense_ledger flow_type/category changes ──
CREATE OR REPLACE FUNCTION public.fn_learn_category_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Find items in purchase_logs for this expense to create category rules
  FOR v_item IN
    SELECT notes, barcode FROM public.purchase_logs WHERE expense_id = NEW.id LIMIT 5
  LOOP
    IF v_item.notes IS NOT NULL AND v_item.notes <> '' THEN
      INSERT INTO public.category_overrides (match_pattern, flow_type, category_code, supplier_id, source)
      VALUES (
        LOWER(v_item.notes),
        NEW.flow_type,
        NEW.category_code,
        NEW.supplier_id,
        'post_approval_trigger'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_correction
AFTER UPDATE OF flow_type, category_code ON public.expense_ledger
FOR EACH ROW
WHEN (OLD.flow_type IS DISTINCT FROM NEW.flow_type
      OR OLD.category_code IS DISTINCT FROM NEW.category_code)
EXECUTE FUNCTION public.fn_learn_category_correction();

-- ── Trigger function: learn from unmatched_items resolution ──
CREATE OR REPLACE FUNCTION public.fn_learn_unmatched_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update supplier_catalog with the resolution
  IF NEW.barcode IS NOT NULL AND NEW.barcode <> '' THEN
    UPDATE public.supplier_catalog
    SET nomenclature_id = NEW.resolved_to,
        updated_at = now()
    WHERE barcode = NEW.barcode
      AND nomenclature_id IS NULL;

    -- Also check if it's a GS1 weight barcode
    IF LEFT(NEW.barcode, 1) = '2' AND LENGTH(NEW.barcode) > 13 THEN
      INSERT INTO public.gs1_weight_items (base_barcode, nomenclature_id, supplier_id, description)
      VALUES (
        LEFT(NEW.barcode, 13),
        NEW.resolved_to,
        NEW.supplier_id,
        NEW.raw_text
      )
      ON CONFLICT (base_barcode) DO UPDATE SET
        nomenclature_id = EXCLUDED.nomenclature_id;
    END IF;
  END IF;

  -- Create correction rule for name matching
  IF NEW.raw_text IS NOT NULL AND NEW.raw_text <> '' THEN
    INSERT INTO public.correction_rules (rule_type, supplier_id, match_pattern, match_field, correction_value, source)
    VALUES (
      'nomenclature',
      NEW.supplier_id,
      LOWER(NEW.raw_text),
      'name',
      jsonb_build_object('nomenclature_id', NEW.resolved_to),
      'post_approval_trigger'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_unmatched_resolved
AFTER UPDATE OF resolved_to ON public.unmatched_items
FOR EACH ROW
WHEN (OLD.resolved_to IS NULL AND NEW.resolved_to IS NOT NULL)
EXECUTE FUNCTION public.fn_learn_unmatched_resolution();

-- ── Migration log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '153_post_approval_triggers.sql',
  'claude-code',
  'Post-approval learning triggers: purchase_logs, expense_ledger, unmatched_items corrections auto-create rules'
) ON CONFLICT (filename) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

Run:
```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w) && psql "$DB_URL" -f services/supabase/migrations/153_post_approval_triggers.sql
```
Expected: `CREATE FUNCTION` x3, `CREATE TRIGGER` x3

- [ ] **Step 3: Commit**

```bash
git add services/supabase/migrations/153_post_approval_triggers.sql
git commit -m "feat(db): post-approval learning triggers — system learns from DB corrections"
```

---

### Task 8: Deploy Edge Function + Integration Test

**Files:**
- Modify: `services/supabase/functions/ocr-receipt/index.ts` (final wiring)

- [ ] **Step 1: Deploy updated edge function**

```bash
cd services && npx supabase functions deploy ocr-receipt --project-ref qcqgtcsjoacuktcewpvo
```
Expected: `Deployed Functions on project qcqgtcsjoacuktcewpvo: ocr-receipt`

- [ ] **Step 2: Manual integration test — category override**

1. Open https://shishka-os.vercel.app/receipts
2. Find a parsed receipt with a misclassified item (e.g. Baking Paper in COGS)
3. Change its Type dropdown to OpEx
4. Click Approve
5. Parse a NEW receipt from the same supplier that contains "baking paper"
6. Verify: the item should now appear as OpEx automatically (override applied)

- [ ] **Step 3: Manual integration test — supplier alias**

1. Parse a receipt where supplier name differs from DB (e.g. "SIAM MAKRO")
2. Approve it
3. Check DB: `SELECT * FROM supplier_aliases WHERE alias ILIKE '%SIAM MAKRO%'`
4. Parse another receipt from "SIAM MAKRO"
5. Verify: supplier resolves instantly, supplier_sku items match correctly

- [ ] **Step 4: Push all changes and create PR**

```bash
git push origin HEAD
gh pr create --base main --title "feat(finance): adaptive receipt learning system" --body "..."
```

- [ ] **Step 5: Merge PR**

```bash
gh pr merge --squash
```
