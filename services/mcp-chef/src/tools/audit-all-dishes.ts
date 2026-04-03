import { getSupabase } from "../lib/supabase.js";
import {
  getBomTree,
  calculateTreeCost,
  calculateTreeNutrition,
} from "../lib/bom-walker.js";

export const auditAllDishesSchema = {
  name: "audit_all_dishes",
  description:
    "Audit all SALE items in the catalog. Returns a summary table with cost, price, margin, nutrition completeness, and issues for each dish. Use for menu-wide health checks.",
  inputSchema: {
    type: "object" as const,
    properties: {
      min_margin_pct: {
        type: "number",
        description: "Flag dishes below this margin (default: 60)",
      },
      only_problems: {
        type: "boolean",
        description: "If true, only return dishes with issues (default: false)",
      },
    },
  },
};

interface DishAudit {
  id: string;
  code: string;
  name: string;
  cost_thb: number;
  price_thb: number;
  margin_pct: number | null;
  has_nutrition: boolean;
  nutrition_complete: boolean;
  ingredient_count: number;
  issues: string[];
}

export async function auditAllDishes(args: {
  min_margin_pct?: number;
  only_problems?: boolean;
}) {
  try {
    const sb = getSupabase();
    const minMargin = args.min_margin_pct ?? 60;

    // Fetch all SALE items
    const { data: dishes, error } = await sb
      .from("nomenclature")
      .select("id, product_code, name, price, is_available")
      .ilike("product_code", "SALE-%")
      .order("product_code");

    if (error) return { error: error.message };
    if (!dishes || dishes.length === 0)
      return { message: "No SALE items found", results: [] };

    const results: DishAudit[] = [];

    for (const dish of dishes) {
      const issues: string[] = [];

      // Build BOM tree
      let tree;
      try {
        tree = await getBomTree(dish.id);
      } catch {
        issues.push("Failed to build BOM tree");
        results.push({
          id: dish.id,
          code: dish.product_code,
          name: dish.name,
          cost_thb: 0,
          price_thb: dish.price || 0,
          margin_pct: null,
          has_nutrition: false,
          nutrition_complete: false,
          ingredient_count: 0,
          issues,
        });
        continue;
      }

      if (!tree || tree.children.length === 0) {
        issues.push("No BOM / empty recipe");
      }

      const cost = tree ? calculateTreeCost(tree) : 0;
      const nutrition = tree ? calculateTreeNutrition(tree) : null;
      const price = dish.price || 0;
      const margin =
        price > 0 ? Math.round(((price - cost) / price) * 100 * 10) / 10 : null;

      // Check issues
      if (price === 0) issues.push("No price set");
      if (cost === 0 && tree && tree.children.length > 0)
        issues.push("Zero cost (missing purchase data?)");
      if (margin !== null && margin < minMargin)
        issues.push(`Low margin: ${margin}%`);
      if (!dish.is_available) issues.push("Marked unavailable");

      // Nutrition completeness
      let nutritionComplete = true;
      let hasNutrition = false;
      if (nutrition) {
        hasNutrition =
          nutrition.calories > 0 ||
          nutrition.protein > 0 ||
          nutrition.carbs > 0 ||
          nutrition.fat > 0;

        // Check for missing leaf nutrition
        function checkLeafNutrition(node: any): boolean {
          if (node.children.length === 0) {
            return !(
              node.item.calories === null &&
              node.item.protein === null &&
              node.item.carbs === null &&
              node.item.fat === null
            );
          }
          return node.children.every((c: any) => checkLeafNutrition(c));
        }

        if (tree) {
          nutritionComplete = checkLeafNutrition(tree);
          if (!nutritionComplete) issues.push("Incomplete nutrition data");
        }
      }

      // Count leaf ingredients
      function countLeaves(node: any): number {
        if (node.children.length === 0) return 1;
        return node.children.reduce(
          (s: number, c: any) => s + countLeaves(c),
          0
        );
      }

      results.push({
        id: dish.id,
        code: dish.product_code,
        name: dish.name,
        cost_thb: Math.round(cost * 100) / 100,
        price_thb: price,
        margin_pct: margin,
        has_nutrition: hasNutrition,
        nutrition_complete: nutritionComplete,
        ingredient_count: tree ? countLeaves(tree) : 0,
        issues,
      });
    }

    const filtered = args.only_problems
      ? results.filter((r) => r.issues.length > 0)
      : results;

    // Summary stats
    const totalDishes = results.length;
    const withIssues = results.filter((r) => r.issues.length > 0).length;
    const avgMargin =
      results.filter((r) => r.margin_pct !== null).length > 0
        ? Math.round(
            (results
              .filter((r) => r.margin_pct !== null)
              .reduce((s, r) => s + r.margin_pct!, 0) /
              results.filter((r) => r.margin_pct !== null).length) *
              10
          ) / 10
        : null;

    return {
      summary: {
        total_dishes: totalDishes,
        dishes_with_issues: withIssues,
        avg_margin_pct: avgMargin,
        min_margin_threshold: minMargin,
      },
      dishes: filtered,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
