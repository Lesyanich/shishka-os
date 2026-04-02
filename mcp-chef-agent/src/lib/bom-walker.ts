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
  let lineCost = 0;
  if (children.length > 0) {
    lineCost = children.reduce((sum, c) => sum + c.line_cost, 0);
  } else {
    lineCost = (item.cost_per_unit || 0) * quantity;
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
    children,
  };
}

/**
 * Calculate total cost from BOM tree.
 */
export function calculateTreeCost(tree: BomTreeNode): number {
  if (tree.children.length === 0) {
    return (tree.item.cost_per_unit || 0) * tree.quantity;
  }
  let cost = tree.children.reduce(
    (sum, c) => sum + calculateTreeCost(c),
    0
  );
  // yield_loss_pct is LOSS: 15 = 15% lost, effective yield = 85%
  if (tree.yield_loss_pct > 0 && tree.yield_loss_pct < 100) {
    cost = cost / (1 - tree.yield_loss_pct / 100);
  }
  return Math.round(cost * 100) / 100;
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
  const costStr = node.line_cost > 0 ? ` (cost: ${node.line_cost} THB)` : "";
  const yieldStr = node.yield_loss_pct > 0 ? ` [loss: ${node.yield_loss_pct}%]` : "";
  const qtyStr = node.depth > 0 ? `${node.quantity} ${node.item.base_unit} ` : "";

  let line = `${indent}${qtyStr}${node.item.product_code} — ${node.item.name}${yieldStr}${costStr}\n`;

  for (const child of node.children) {
    line += formatBomTree(child, indent + "  ");
  }

  return line;
}
