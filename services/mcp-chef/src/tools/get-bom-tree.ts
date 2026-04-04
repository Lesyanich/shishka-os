import {
  getBomTree,
  calculateTreeCost,
  calculateTreeNutrition,
  formatBomTree,
} from "../lib/bom-walker.js";

export const getBomTreeSchema = {
  name: "get_bom_tree",
  description:
    "Get the full BOM (Bill of Materials / recipe) tree for a product. Returns ingredients at all levels with costs and nutrition calculated recursively. Use to inspect a dish's recipe structure.",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "UUID of the product to inspect",
      },
    },
    required: ["product_id"],
  },
};

export async function getBomTreeTool(args: { product_id: string }) {
  try {
    const tree = await getBomTree(args.product_id);

    if (!tree) {
      return { error: "Product not found" };
    }

    const totalCost = calculateTreeCost(tree);
    const nutrition = calculateTreeNutrition(tree);
    const formatted = formatBomTree(tree);

    return {
      product: {
        code: tree.item.product_code,
        name: tree.item.name,
        type: tree.item.type,
        unit: tree.item.base_unit,
        price: tree.item.price,
      },
      bom_tree: formatted,
      total_cost: totalCost,
      margin:
        tree.item.price && totalCost > 0
          ? Math.round(((tree.item.price - totalCost) / tree.item.price) * 100)
          : null,
      nutrition,
      has_children: tree.children.length > 0,
      ingredient_count: countLeaves(tree),
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

function countLeaves(node: any): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce(
    (sum: number, c: any) => sum + countLeaves(c),
    0
  );
}
