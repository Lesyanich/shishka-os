import { getBomTree, calculateTreeCost, collectNullCostLeaves, collectEstimatedCostLeaves } from "../lib/bom-walker.js";

export const calculateCostSchema = {
  name: "calculate_cost",
  description:
    "Calculate the total cost of a product by recursively walking its BOM tree. Uses WAC (Weighted Average Cost) from actual purchases. Returns cost breakdown and margin if price is set. Returns warnings if any ingredient has no purchase history.",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "UUID of the product",
      },
    },
    required: ["product_id"],
  },
};

export async function calculateCost(args: { product_id: string }) {
  try {
    const tree = await getBomTree(args.product_id);
    if (!tree) return { error: "Product not found" };

    const totalCost = calculateTreeCost(tree);
    const price = tree.item.price || 0;
    const margin = price > 0 ? ((price - totalCost) / price) * 100 : null;
    const markup = totalCost > 0 ? ((price - totalCost) / totalCost) * 100 : null;

    // Collect ingredients with no price source at all
    const nullCostLeaves = collectNullCostLeaves(tree);
    // Collect ingredients using estimated price (supplier_catalog fallback)
    const estimatedLeaves = collectEstimatedCostLeaves(tree);

    // Breakdown by direct children
    const breakdown = tree.children.map((child) => ({
      ingredient: child.item.product_code,
      name: child.item.name,
      quantity: child.quantity,
      unit: child.item.base_unit,
      cost: child.line_cost,
      is_estimated: child.is_estimated,
      pct_of_total: totalCost > 0
        ? Math.round((child.line_cost / totalCost) * 100)
        : 0,
    }));

    const warnings: string[] = [];
    if (nullCostLeaves.length > 0) {
      const items = nullCostLeaves
        .map((i) => `${i.product_code} (${i.name})`)
        .join(", ");
      warnings.push(
        `NO_PRICE: ${nullCostLeaves.length} ingredient(s) have no WAC and no supplier catalog price — cost treated as 0. Margin is UNRELIABLE. Missing: ${items}`
      );
    }
    if (estimatedLeaves.length > 0) {
      const items = estimatedLeaves
        .map((i) => `${i.product_code} (${i.name})`)
        .join(", ");
      warnings.push(
        `ESTIMATED: ${estimatedLeaves.length} ingredient(s) use supplier catalog price (not WAC from purchases). Cost is approximate: ${items}`
      );
    }

    return {
      product: tree.item.product_code,
      name: tree.item.name,
      total_cost_thb: Math.round(totalCost * 100) / 100,
      price_thb: price,
      margin_pct: margin ? Math.round(margin * 10) / 10 : null,
      markup_pct: markup ? Math.round(markup * 10) / 10 : null,
      cost_complete: nullCostLeaves.length === 0,
      cost_estimated: estimatedLeaves.length > 0,
      warnings,
      breakdown,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
