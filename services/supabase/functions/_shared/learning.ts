import { db } from "./supabase.ts"

/**
 * Apply learned category overrides to parsed line items.
 * Runs AFTER LLM classification, BEFORE classifyItems().
 * Overrides LLM category when a matching rule exists.
 */
export async function applyCategoryOverrides(
  lineItems: Record<string, unknown>[],
  supplierId: string | null,
): Promise<number> {
  let overrideCount = 0

  for (const item of lineItems) {
    const name = (item.translated_name as string) || (item.original_name as string) || ""
    if (!name || name.length < 3) continue

    const pattern = name.slice(0, 60).toLowerCase()

    // Build query: match pattern against name, prefer supplier-specific rules
    let query = db
      .from("category_overrides")
      .select("id, flow_type, category_code, times_applied")

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
        overrideCount++
        // Increment times_applied (fire and forget)
        db.from("category_overrides")
          .update({ times_applied: (override.times_applied ?? 0) + 1 })
          .eq("id", override.id)
          .then(() => {})
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
