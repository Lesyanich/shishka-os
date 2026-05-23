import { getSupabase } from "./supabase.js";

// ── Types ──

export interface NomenclatureItem {
  id: string;
  product_code: string;
  name: string;
  type: string;
  base_unit: string;
  cost_per_unit: number | null;
  price: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  allergens: string[] | null;
  is_available: boolean;
}

export interface BomLine {
  id: string;
  parent_id: string;
  ingredient_id: string;
  quantity_per_unit: number;
  yield_loss_pct: number | null; // DB column: percentage of LOSS (15 = 15% lost, effective yield = 85%)
  notes: string | null;
}

export interface BomTreeNode {
  item: NomenclatureItem;
  quantity: number;
  yield_loss_pct: number; // loss percentage (0 = no loss, 15 = 15% lost)
  depth: number;
  line_cost: number;
  has_null_cost: boolean; // true if this leaf or any descendant has no price source at all
  is_estimated: boolean; // true if cost comes from supplier_catalog.last_seen_price, not WAC
  children: BomTreeNode[];
}

export interface NutritionSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  allergens: string[];
}

// ── BOM Tree Walker ──

/**
 * Recursively walks the BOM tree for a product.
 * Returns a tree structure with costs calculated at each level.
 */
export async function getBomTree(
  productId: string,
  quantity: number = 1,
  yieldLossPct: number = 0,
  depth: number = 0,
  visited: Set<string> = new Set()
): Promise<BomTreeNode | null> {
  const sb = getSupabase();

  // Circular reference protection
  if (visited.has(productId)) {
    throw new Error(`Circular BOM reference detected: ${productId}`);
  }
  visited.add(productId);

  // Fetch the product
  const { data: item, error: itemErr } = await sb
    .from("nomenclature")
    .select(
      "id, product_code, name, type, base_unit, cost_per_unit, price, calories, protein, carbs, fat, allergens, is_available"
    )
    .eq("id", productId)
    .single();

  if (itemErr || !item) return null;

  // Fetch BOM children
  const { data: bomLines, error: bomErr } = await sb
    .from("bom_structures")
    .select("id, parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes")
    .eq("parent_id", productId);

  if (bomErr) throw new Error(`BOM query error: ${bomErr.message}`);

  const children: BomTreeNode[] = [];

  if (bomLines && bomLines.length > 0) {
    for (const line of bomLines) {
      const child = await getBomTree(
        line.ingredient_id,
        line.quantity_per_unit,
        line.yield_loss_pct ?? 0,
        depth + 1,
        new Set(visited) // new set per branch to allow shared ingredients
      );
      if (child) children.push(child);
    }
  }

  // Calculate cost: if has children, sum children costs; otherwise use own cost_per_unit
  // Fallback chain for leaves: WAC → supplier_catalog.last_seen_price → 0
  let lineCost = 0;
  let hasNullCost = false;
  let isEstimated = false;

  if (children.length > 0) {
    lineCost = children.reduce((sum, c) => sum + c.line_cost, 0) * quantity;
  } else if (item.cost_per_unit != null) {
    lineCost = item.cost_per_unit * quantity;
  } else {
    // WAC missing — try supplier_catalog fallback
    const { data: catalogEntry } = await sb
      .from("supplier_catalog")
      .select("last_seen_price, conversion_factor")
      .eq("nomenclature_id", productId)
      .not("last_seen_price", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (catalogEntry?.last_seen_price && catalogEntry.conversion_factor) {
      const costPerBaseUnit = catalogEntry.last_seen_price / catalogEntry.conversion_factor;
      lineCost = costPerBaseUnit * quantity;
      isEstimated = true;
    } else if (catalogEntry?.last_seen_price) {
      // No conversion_factor — use price as-is (assume 1:1)
      lineCost = catalogEntry.last_seen_price * quantity;
      isEstimated = true;
    } else {
      hasNullCost = true;
    }
  }

  // Adjust for yield loss: yield_loss_pct is LOSS percentage
  // e.g., yield_loss_pct=15 means 15% is lost, so effective yield = 85%
  // cost increases to compensate: cost / (1 - loss/100)
  if (yieldLossPct > 0 && yieldLossPct < 100) {
    lineCost = lineCost / (1 - yieldLossPct / 100);
  }

  return {
    item: item as NomenclatureItem,
    quantity,
    yield_loss_pct: yieldLossPct,
    depth,
    line_cost: Math.round(lineCost * 100) / 100,
    has_null_cost: hasNullCost || children.some((c) => c.has_null_cost),
    is_estimated: isEstimated || children.some((c) => c.is_estimated),
    children,
  };
}

/**
 * Collect leaf ingredients that have no price source at all (no WAC, no supplier_catalog).
 */
export function collectNullCostLeaves(
  node: BomTreeNode,
  result: { product_code: string; name: string }[] = []
): { product_code: string; name: string }[] {
  if (node.children.length === 0) {
    if (node.has_null_cost) {
      result.push({ product_code: node.item.product_code, name: node.item.name });
    }
  } else {
    for (const child of node.children) {
      collectNullCostLeaves(child, result);
    }
  }
  return result;
}

/**
 * Collect leaf ingredients using estimated cost (supplier_catalog fallback, not WAC).
 */
export function collectEstimatedCostLeaves(
  node: BomTreeNode,
  result: { product_code: string; name: string }[] = []
): { product_code: string; name: string }[] {
  if (node.children.length === 0) {
    if (node.is_estimated) {
      result.push({ product_code: node.item.product_code, name: node.item.name });
    }
  } else {
    for (const child of node.children) {
      collectEstimatedCostLeaves(child, result);
    }
  }
  return result;
}

/**
 * Calculate total cost from BOM tree.
 * Uses pre-computed line_cost which already includes supplier_catalog fallback.
 */
export function calculateTreeCost(tree: BomTreeNode): number {
  return tree.line_cost;
}

/**
 * Calculate nutrition from BOM tree (cascade from leaves).
 */
export function calculateTreeNutrition(tree: BomTreeNode): NutritionSummary {
  if (tree.children.length === 0) {
    // For nutrition: do NOT apply lossFactor.
    // quantity_per_unit already represents the gross input amount.
    // Nutrients (protein, fat, carbs) stay in the product — only water/waste is lost.
    // So: nutrition = nutrient_per_base_unit × quantity (the full input amount).
    // This differs from cost, where lossFactor adjusts for buying more than you keep.
    return {
      calories: (tree.item.calories || 0) * tree.quantity,
      protein: (tree.item.protein || 0) * tree.quantity,
      carbs: (tree.item.carbs || 0) * tree.quantity,
      fat: (tree.item.fat || 0) * tree.quantity,
      allergens: tree.item.allergens || [],
    };
  }

  const result: NutritionSummary = {
    calories: 0, protein: 0, carbs: 0, fat: 0, allergens: [],
  };
  const allergenSet = new Set<string>();

  for (const child of tree.children) {
    const childNutr = calculateTreeNutrition(child);
    result.calories += childNutr.calories;
    result.protein += childNutr.protein;
    result.carbs += childNutr.carbs;
    result.fat += childNutr.fat;
    childNutr.allergens.forEach((a) => allergenSet.add(a));
  }

  result.allergens = Array.from(allergenSet);

  // Scale by this node's quantity in parent BOM
  result.calories *= tree.quantity;
  result.protein *= tree.quantity;
  result.carbs *= tree.quantity;
  result.fat *= tree.quantity;

  // Round
  result.calories = Math.round(result.calories * 10) / 10;
  result.protein = Math.round(result.protein * 10) / 10;
  result.carbs = Math.round(result.carbs * 10) / 10;
  result.fat = Math.round(result.fat * 10) / 10;

  return result;
}

/**
 * Flatten BOM tree to a readable text representation.
 */
export function formatBomTree(node: BomTreeNode, indent: string = ""): string {
  const estTag = node.is_estimated ? " (est.)" : "";
  const costStr = node.line_cost > 0 ? ` (cost: ${node.line_cost} THB${estTag})` : "";
  const yieldStr = node.yield_loss_pct > 0 ? ` [loss: ${node.yield_loss_pct}%]` : "";
  const qtyStr = node.depth > 0 ? `${node.quantity} ${node.item.base_unit} ` : "";

  let line = `${indent}${qtyStr}${node.item.product_code} — ${node.item.name}${yieldStr}${costStr}\n`;

  for (const child of node.children) {
    line += formatBomTree(child, indent + "  ");
  }

  return line;
}
