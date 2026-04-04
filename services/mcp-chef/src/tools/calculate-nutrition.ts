import { getBomTree, calculateTreeNutrition } from "../lib/bom-walker.js";

export const calculateNutritionSchema = {
  name: "calculate_nutrition",
  description:
    "Calculate aggregated KBZHU (calories, protein, carbs, fat) and allergens for a product by cascading through its BOM tree. Values are per base_unit of the product.",
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

export async function calculateNutrition(args: { product_id: string }) {
  try {
    const tree = await getBomTree(args.product_id);
    if (!tree) return { error: "Product not found" };

    const nutrition = calculateTreeNutrition(tree);

    // Check which ingredients are missing nutrition data
    const missing: string[] = [];
    function checkMissing(node: any) {
      if (node.children.length === 0) {
        if (
          node.item.calories === null &&
          node.item.protein === null &&
          node.item.carbs === null &&
          node.item.fat === null
        ) {
          missing.push(`${node.item.product_code} (${node.item.name})`);
        }
      }
      for (const child of node.children) checkMissing(child);
    }
    checkMissing(tree);

    return {
      product: tree.item.product_code,
      name: tree.item.name,
      unit: tree.item.base_unit,
      nutrition: {
        calories_kcal: nutrition.calories,
        protein_g: nutrition.protein,
        carbs_g: nutrition.carbs,
        fat_g: nutrition.fat,
        allergens: nutrition.allergens,
      },
      missing_nutrition_data: missing.length > 0 ? missing : null,
      warning:
        missing.length > 0
          ? `${missing.length} ingredient(s) have no nutrition data. Values may be incomplete.`
          : null,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
