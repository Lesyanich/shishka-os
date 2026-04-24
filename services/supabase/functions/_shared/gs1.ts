import { db } from "./supabase.ts"

export interface GS1ParseResult {
  base: string
  weight: number | null
}

/**
 * Parse a GS1 variable-weight barcode.
 * Format: prefix "2" + item code (12 digits) + weight/price suffix
 * Example: "210015010088000005764" → base "2100150100880", weight 5.764 kg
 */
export function parseGS1WeightBarcode(barcode: string): GS1ParseResult | null {
  if (!barcode || barcode.length < 13) return null
  if (barcode[0] !== "2") return null
  if (barcode.length <= 13) return null

  const base = barcode.slice(0, 13)
  const weightDigits = barcode.slice(13)
  const weightRaw = parseInt(weightDigits, 10)
  if (isNaN(weightRaw)) return { base, weight: null }
  const weight = weightRaw / 1000
  return { base, weight }
}

/**
 * Look up a GS1 base barcode in gs1_weight_items table.
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
  // Fallback: supplier_catalog by base barcode
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
