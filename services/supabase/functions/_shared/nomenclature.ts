import { db } from "./supabase.ts"

export async function resolveSupplier(name: string): Promise<string | null> {
  if (!name) return null
  const { data } = await db
    .from("suppliers")
    .select("id")
    .ilike("name", `%${name}%`)
    .limit(1)
  return data?.[0]?.id ?? null
}

export async function matchNomenclature(
  supplierId: string | null,
  item: { barcode?: string | null; supplier_sku?: string | null; translated_name?: string; original_name?: string | null },
): Promise<{ nomenclature_id: string | null; sku_id: string | null; confidence: string }> {
  if (item.barcode) {
    const { data } = await db
      .from("supplier_catalog")
      .select("nomenclature_id, sku_id")
      .eq("barcode", item.barcode)
      .order("match_count", { ascending: false })
      .limit(1)
    if (data?.[0]?.nomenclature_id) {
      return { nomenclature_id: data[0].nomenclature_id, sku_id: data[0].sku_id, confidence: "high" }
    }
  }
  if (item.supplier_sku && supplierId) {
    const { data } = await db
      .from("supplier_catalog")
      .select("nomenclature_id, sku_id")
      .eq("supplier_sku", item.supplier_sku)
      .eq("supplier_id", supplierId)
      .order("match_count", { ascending: false })
      .limit(1)
    if (data?.[0]?.nomenclature_id) {
      return { nomenclature_id: data[0].nomenclature_id, sku_id: data[0].sku_id, confidence: "high" }
    }
  }
  // Fallback: match translated_name against supplier_catalog.product_name (English cross-check)
  if (item.translated_name) {
    const nameQuery = item.translated_name.slice(0, 40)
    const { data: scMatch } = await db
      .from("supplier_catalog")
      .select("nomenclature_id, id")
      .ilike("product_name", `%${nameQuery}%`)
      .not("nomenclature_id", "is", null)
      .order("match_count", { ascending: false })
      .limit(1)
    if (scMatch?.[0]?.nomenclature_id) {
      return { nomenclature_id: scMatch[0].nomenclature_id, sku_id: scMatch[0].id, confidence: "medium" }
    }

    // Also try original_name from supplier_catalog (Thai name from previous receipts)
    if (item.original_name) {
      const thQuery = item.original_name.slice(0, 40)
      const { data: scThMatch } = await db
        .from("supplier_catalog")
        .select("nomenclature_id, id")
        .ilike("original_name", `%${thQuery}%`)
        .not("nomenclature_id", "is", null)
        .order("match_count", { ascending: false })
        .limit(1)
      if (scThMatch?.[0]?.nomenclature_id) {
        return { nomenclature_id: scThMatch[0].nomenclature_id, sku_id: scThMatch[0].id, confidence: "medium" }
      }
    }

    // Last resort: fuzzy match against nomenclature.name
    const { data } = await db
      .from("nomenclature")
      .select("id")
      .ilike("name", `%${nameQuery}%`)
      .limit(1)
    if (data?.[0]?.id) {
      return { nomenclature_id: data[0].id, sku_id: null, confidence: "medium" }
    }
  }
  return { nomenclature_id: null, sku_id: null, confidence: "low" }
}

export function classifyItems(lineItems: Record<string, unknown>[]) {
  const food_items: Record<string, unknown>[] = []
  const capex_items: Record<string, unknown>[] = []
  const opex_items: Record<string, unknown>[] = []

  for (const item of lineItems) {
    const cat = (item.category as string) || "food"
    const base = {
      name: item.translated_name || item.original_name,
      original_name: item.original_name,
      quantity: item.quantity,
      unit: item.unit || "pcs",
      unit_price: item.unit_price,
      total_price: item.total_price,
      barcode: item.barcode || null,
      supplier_sku: item.supplier_sku || null,
      brand: item.brand || null,
      package_weight: item.package_weight || null,
      nomenclature_id: item.nomenclature_id || null,
      sku_id: item.sku_id || null,
      confidence: item.confidence || "low",
    }
    if (cat === "capex") capex_items.push({ description: base.name, ...base })
    else if (cat === "opex") opex_items.push({ description: base.name, ...base })
    else food_items.push(base)
  }
  return { food_items, capex_items, opex_items }
}

export function determineFlowType(food: unknown[], capex: unknown[], opex: unknown[]): string {
  if (capex.length > 0) return "CapEx"
  if (food.length === 0 && opex.length > 0) return "OpEx"
  return "COGS"
}
