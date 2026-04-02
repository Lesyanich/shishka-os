import { getSupabase } from "./supabase.js";

const VALID_PREFIXES = ["RAW", "PF", "MOD", "SALE"];
const VALID_UNITS = ["kg", "g", "L", "ml", "pcs"];

// Lego chain: which types can contain which
const ALLOWED_CHILDREN: Record<string, string[]> = {
  SALE: ["PF", "MOD"],
  PF: ["RAW", "PF"],
  MOD: ["RAW"],
  RAW: [], // RAW items cannot have BOM children
};

/**
 * Validate product_code format: PREFIX-NAME_PARTS
 */
export function validateProductCode(code: string): string | null {
  if (!code || code.length < 4) return "Product code too short";
  const parts = code.split("-");
  if (parts.length < 2) return "Product code must be PREFIX-NAME (e.g., RAW-CARROT)";
  const prefix = parts[0];
  if (!VALID_PREFIXES.includes(prefix))
    return `Invalid prefix "${prefix}". Must be one of: ${VALID_PREFIXES.join(", ")}`;
  const name = parts.slice(1).join("-");
  if (!/^[A-Z0-9_]+$/.test(name))
    return "Name part must be ALL_CAPS_WITH_UNDERSCORES (e.g., FRESH_CARROT)";
  return null;
}

/**
 * Validate base_unit.
 */
export function validateBaseUnit(unit: string): string | null {
  if (!VALID_UNITS.includes(unit))
    return `Invalid base_unit "${unit}". Must be one of: ${VALID_UNITS.join(", ")}`;
  return null;
}

/**
 * Validate Lego chain: parent type can contain child type.
 */
export function validateLegoChain(
  parentCode: string,
  childCode: string
): string | null {
  const parentPrefix = parentCode.split("-")[0];
  const childPrefix = childCode.split("-")[0];

  const allowed = ALLOWED_CHILDREN[parentPrefix];
  if (!allowed)
    return `Unknown parent type: ${parentPrefix}`;
  if (!allowed.includes(childPrefix))
    return `${parentPrefix} cannot contain ${childPrefix}. Allowed children: ${allowed.join(", ")}`;
  return null;
}

/**
 * Check for circular BOM references.
 */
export async function checkCircularRef(
  parentId: string,
  ingredientId: string
): Promise<string | null> {
  if (parentId === ingredientId)
    return "Cannot add item as its own ingredient";

  // Walk up from parent to see if ingredientId is an ancestor
  const sb = getSupabase();
  const visited = new Set<string>([parentId]);
  const queue = [parentId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { data: parents } = await sb
      .from("bom_structures")
      .select("parent_id")
      .eq("ingredient_id", current);

    if (parents) {
      for (const p of parents) {
        if (p.parent_id === ingredientId)
          return `Circular reference: adding ${ingredientId} would create a cycle`;
        if (!visited.has(p.parent_id)) {
          visited.add(p.parent_id);
          queue.push(p.parent_id);
        }
      }
    }
  }

  return null;
}

/**
 * Validate nutrition values.
 * Also warns if values look like per-100g instead of per-base_unit.
 */
export function validateNutrition(
  values: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  },
  baseUnit?: string,
): string | null {
  for (const [key, val] of Object.entries(values)) {
    if (val !== undefined && val < 0)
      return `${key} cannot be negative`;
  }

  // Sanity check: detect likely per-100g values when base_unit is kg or L.
  // Common foods: chicken=1650/kg, rice=3600/kg, oil=8840/L, sugar=3870/kg.
  // If calories < 1000 and base_unit is kg/L, almost certainly entered per-100g.
  if (
    baseUnit &&
    (baseUnit === "kg" || baseUnit === "L") &&
    values.calories !== undefined &&
    values.calories > 0 &&
    values.calories < 500
  ) {
    return (
      `NUTRITION UNIT ERROR: calories=${values.calories} looks like a per-100g value, ` +
      `but base_unit is "${baseUnit}". For ${baseUnit}, values must be per 1 ${baseUnit}. ` +
      `Multiply by 10 to convert from per-100g/100ml. ` +
      `Example: chicken breast = 1650 kcal/kg (not 165).`
    );
  }

  return null;
}

/**
 * Check product_code uniqueness.
 */
export async function checkCodeUnique(code: string): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("nomenclature")
    .select("id")
    .eq("product_code", code)
    .limit(1);

  if (data && data.length > 0)
    return `Product code "${code}" already exists`;
  return null;
}

/**
 * Fuzzy search for similar products by name.
 * Returns matches where name contains any keyword from the search term.
 * Helps prevent duplicates like "Romaine Lettuce" vs "Lettuce Romaine".
 */
export async function findSimilarProducts(
  name: string,
  productCode: string
): Promise<{ id: string; product_code: string; name: string }[]> {
  const sb = getSupabase();

  // Extract meaningful keywords (3+ chars, skip common words)
  const stopWords = new Set(["the", "and", "for", "with", "fresh", "raw", "organic"]);
  const keywords = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  // Also extract name part from product_code (RAW-ROMAINE_LETTUCE → romaine lettuce)
  const codeName = productCode
    .split("-")
    .slice(1)
    .join("-")
    .replace(/_/g, " ")
    .toLowerCase();
  const codeKeywords = codeName
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  const allKeywords = [...new Set([...keywords, ...codeKeywords])];
  if (allKeywords.length === 0) return [];

  // Search by each keyword using ilike
  const results = new Map<string, { id: string; product_code: string; name: string }>();

  for (const kw of allKeywords) {
    const { data } = await sb
      .from("nomenclature")
      .select("id, product_code, name")
      .or(`name.ilike.%${kw}%,product_code.ilike.%${kw}%`)
      .limit(10);

    if (data) {
      for (const item of data) {
        results.set(item.id, item);
      }
    }
  }

  return Array.from(results.values());
}

/**
 * Check if a RAW ingredient exists at any supplier.
 * Queries supplier_catalog table (not the legacy supplier_products).
 * Returns supplier info or empty array if not found.
 *
 * supplier_catalog columns:
 *   supplier_id, nomenclature_id, sku_id, supplier_sku, original_name,
 *   purchase_unit, conversion_factor, base_unit, barcode, product_name,
 *   product_name_th, brand, full_title, package_weight, package_qty,
 *   package_unit, package_type, last_seen_price, source, verified_at
 */
export async function checkSupplierAvailability(
  productName: string,
  productId?: string
): Promise<{
  found: boolean;
  suppliers: { supplier_name: string; sku: string; price: number; unit: string }[];
}> {
  const sb = getSupabase();

  // If we have a product_id, check direct link in supplier_catalog
  if (productId) {
    const { data } = await sb
      .from("supplier_catalog")
      .select("supplier_sku, last_seen_price, purchase_unit, supplier:suppliers(name)")
      .eq("nomenclature_id", productId);

    if (data && data.length > 0) {
      return {
        found: true,
        suppliers: data.map((sp: any) => ({
          supplier_name: sp.supplier?.name || "Unknown",
          sku: sp.supplier_sku || "",
          price: sp.last_seen_price || 0,
          unit: sp.purchase_unit || "",
        })),
      };
    }
  }

  // Fuzzy search by name in supplier_catalog (product_name or original_name)
  const keywords = productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  for (const kw of keywords) {
    const { data } = await sb
      .from("supplier_catalog")
      .select("supplier_sku, last_seen_price, purchase_unit, original_name, supplier:suppliers(name)")
      .or(`product_name.ilike.%${kw}%,original_name.ilike.%${kw}%`)
      .limit(10);

    if (data && data.length > 0) {
      return {
        found: true,
        suppliers: data.map((sp: any) => ({
          supplier_name: sp.supplier?.name || "Unknown",
          sku: sp.supplier_sku || "",
          price: sp.last_seen_price || 0,
          unit: sp.purchase_unit || "",
        })),
      };
    }
  }

  return { found: false, suppliers: [] };
}
