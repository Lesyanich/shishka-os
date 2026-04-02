import { getBomTree, calculateTreeCost } from "../lib/bom-walker.js";

export const suggestPriceSchema = {
  name: "suggest_price",
  description:
    "Suggest a selling price for a product based on its BOM cost and target margin. Shows current price vs suggested price for different margin targets (60%, 65%, 70%, 75%).",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "UUID of the product",
      },
      target_margin_pct: {
        type: "number",
        description:
          "Target margin percentage (default: 70). Price = cost / (1 - margin/100)",
      },
    },
    required: ["product_id"],
  },
};

export async function suggestPrice(args: {
  product_id: string;
  target_margin_pct?: number;
}) {
  try {
    const tree = await getBomTree(args.product_id);
    if (!tree) return { error: "Product not found" };

    const totalCost = calculateTreeCost(tree);
    if (totalCost === 0) {
      return {
        error:
          "Cannot suggest price: total cost is 0. Check that ingredients have cost_per_unit values.",
      };
    }

    const currentPrice = tree.item.price || 0;
    const currentMargin =
      currentPrice > 0
        ? Math.round(((currentPrice - totalCost) / currentPrice) * 100 * 10) /
          10
        : null;

    // Standard margin tiers for Thai restaurant
    const tiers = [60, 65, 70, 75];
    const targetMargin = args.target_margin_pct || 70;

    // Add custom target if not in tiers
    const allTiers = tiers.includes(targetMargin)
      ? tiers
      : [...tiers, targetMargin].sort((a, b) => a - b);

    const suggestions = allTiers.map((margin) => {
      const price = totalCost / (1 - margin / 100);
      // Round to nearest 5 THB for menu-friendly pricing
      const roundedPrice = Math.ceil(price / 5) * 5;
      return {
        margin_pct: margin,
        exact_price_thb: Math.round(price * 100) / 100,
        menu_price_thb: roundedPrice,
        is_target: margin === targetMargin,
      };
    });

    return {
      product: tree.item.product_code,
      name: tree.item.name,
      total_cost_thb: Math.round(totalCost * 100) / 100,
      current_price_thb: currentPrice,
      current_margin_pct: currentMargin,
      suggestions,
      recommendation:
        currentMargin !== null && currentMargin < 60
          ? `⚠️ Current margin (${currentMargin}%) is below 60%. Consider raising the price.`
          : currentMargin !== null && currentMargin > 80
            ? `Current margin (${currentMargin}%) is very high. Price may be uncompetitive.`
            : null,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
