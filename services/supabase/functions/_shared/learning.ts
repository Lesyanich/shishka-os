import { db } from "./supabase.ts"

/**
 * Record of one rule application during ocr-receipt's apply phase.
 * Caller persists these to receipt_inbox.applied_overrides; the
 * approve_receipt RPC diffs them against the approved payload to
 * increment counters atomically (RULE-LEARNING-COUNTERS).
 */
export interface AppliedOverride {
  table: "category_overrides"
  rule_id: string
  item_match_key: string         // lowercased item name used to find in approved payload
  suggested_flow_type: "COGS" | "OpEx" | "CapEx"
}

/**
 * Apply learned category overrides to parsed line items.
 * Runs AFTER LLM classification, BEFORE classifyItems().
 *
 * For each rule that fires, returns an AppliedOverride record. Caller
 * (ocr-receipt) writes the array to receipt_inbox.applied_overrides;
 * counter increments happen on approval inside the persist transaction.
 * Increments are NOT performed here (was fire-and-forget — broke
 * RULE-LEARNING-COUNTERS atomicity).
 */
export async function applyCategoryOverrides(
  lineItems: Record<string, unknown>[],
  supplierId: string | null,
): Promise<AppliedOverride[]> {
  const applied: AppliedOverride[] = []

  for (const item of lineItems) {
    const original = (item.original_name as string) || ""
    const translated = (item.translated_name as string) || ""
    const name = translated || original
    if (!name || name.length < 3) continue

    const pattern = name.slice(0, 60).toLowerCase()

    let query = db
      .from("category_overrides")
      .select("id, flow_type, category_code")

    if (supplierId) {
      query = query.or(`supplier_id.eq.${supplierId},supplier_id.is.null`)
    } else {
      query = query.is("supplier_id", null)
    }

    const { data } = await query
      .ilike("match_pattern", `%${pattern}%`)
      .order("supplier_id", { nullsFirst: false, ascending: false })
      .order("times_applied", { ascending: false })
      .limit(1)

    if (data?.[0]) {
      const override = data[0]
      const newCat = override.flow_type === "COGS" ? "food"
        : override.flow_type === "CapEx" ? "capex" : "opex"
      const oldCat = (item.category as string) || "food"

      if (oldCat !== newCat) {
        item.category = newCat
        applied.push({
          table: "category_overrides",
          rule_id: override.id,
          item_match_key: (original || translated).toLowerCase(),
          suggested_flow_type: override.flow_type as "COGS" | "OpEx" | "CapEx",
        })
      }
    }
  }

  return applied
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
