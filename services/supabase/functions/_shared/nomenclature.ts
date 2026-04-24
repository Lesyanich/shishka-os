import { db } from "./supabase.ts"
import { parseGS1WeightBarcode, matchGS1WeightItem } from "./gs1.ts"

export interface ResolvedSupplier {
  id: string | null
  ocr_profile: Record<string, unknown> | null
}

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

export async function matchNomenclature(
  supplierId: string | null,
  item: { barcode?: string | null; supplier_sku?: string | null; translated_name?: string; original_name?: string | null },
): Promise<{ nomenclature_id: string | null; sku_id: string | null; confidence: string }> {
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

  if (item.barcode) {
    // Level 1a: supplier_catalog by barcode
    const { data } = await db
      .from("supplier_catalog")
      .select("nomenclature_id, sku_id")
      .eq("barcode", item.barcode)
      .order("match_count", { ascending: false })
      .limit(1)
    if (data?.[0]?.nomenclature_id) {
      return { nomenclature_id: data[0].nomenclature_id, sku_id: data[0].sku_id, confidence: "high" }
    }

    // Level 1b: SKU table by barcode (mirrors fn_approve_receipt Level 1)
    const { data: skuMatch } = await db
      .from("sku")
      .select("nomenclature_id, id")
      .eq("barcode", item.barcode)
      .not("nomenclature_id", "is", null)
      .limit(1)
    if (skuMatch?.[0]?.nomenclature_id) {
      return { nomenclature_id: skuMatch[0].nomenclature_id, sku_id: skuMatch[0].id, confidence: "high" }
    }

    // Level 1c: purchase_logs by barcode (items previously approved)
    const { data: plMatch } = await db
      .from("purchase_logs")
      .select("nomenclature_id, sku_id")
      .eq("barcode", item.barcode)
      .not("nomenclature_id", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(1)
    if (plMatch?.[0]?.nomenclature_id) {
      return { nomenclature_id: plMatch[0].nomenclature_id, sku_id: plMatch[0].sku_id, confidence: "high" }
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
    // Require minimum 8 chars to avoid false positives like "Gas" → "Hummus Garnish"
    if (nameQuery.length >= 8) {
      const { data } = await db
        .from("nomenclature")
        .select("id")
        .ilike("name", `%${nameQuery}%`)
        .limit(1)
      if (data?.[0]?.id) {
        return { nomenclature_id: data[0].id, sku_id: null, confidence: "low" }
      }
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
