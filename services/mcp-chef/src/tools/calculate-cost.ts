import { getBomTree, calculateTreeCost } from "../lib/bom-walker.js";

export const calculateCostSchema = {
  name: "calculate_cost",
  description:
    "Calculate the total cost of a product by recursively walking its BOM tree. Uses WAC (Weighted Average Cost) from actual purchases. Returns cost breakdown and margin if price is set.",
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

    // Breakdown by direct children
    const breakdown = tree.children.map((child) => ({
      ingredient: child.item.product_code,
      name: child.item.name,
      quantity: child.quantity,
      unit: child.item.base_unit,
      cost: child.line_cost,
      pct_of_total: totalCost > 0
        ? Math.round((child.line_cost / totalCost) * 100)
        : 0,
    }));

    return {
      product: tree.item.product_code,
      name: tree.item.name,
      total_cost_thb: Math.round(totalCost * 100) / 100,
      price_thb: price,
      margin_pct: margin ? Math.round(margin * 10) / 10 : null,
      markup_pct: markup ? Math.round(markup * 10) / 10 : null,
      breakdown,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
