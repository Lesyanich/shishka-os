import { getSupabase } from "../lib/supabase.js";

export const searchProductsSchema = {
  name: "search_products",
  description:
    "Search the product catalog (nomenclature). Returns matching items with nutrition, cost, and availability. Use to find ingredients, semi-finished products, modifiers, or dishes.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search term (matches product_code or name)",
      },
      type: {
        type: "string",
        enum: ["RAW", "PF", "MOD", "SALE"],
        description:
          "Filter by product type prefix. RAW = raw ingredients, PF = semi-finished, MOD = modifiers/toppings, SALE = finished dishes",
      },
      limit: {
        type: "number",
        description: "Max results (default: 20)",
      },
    },
    required: ["query"],
  },
};

export async function searchProducts(args: {
  query: string;
  type?: string;
  limit?: number;
}) {
  const sb = getSupabase();
  const limit = args.limit || 20;

  let q = sb
    .from("nomenclature")
    .select(
      "id, product_code, name, type, base_unit, cost_per_unit, price, calories, protein, carbs, fat, allergens, is_available"
    )
    .or(`product_code.ilike.%${args.query}%,name.ilike.%${args.query}%`)
    .order("product_code")
    .limit(limit);

  if (args.type) {
    q = q.ilike("product_code", `${args.type}-%`);
  }

  const { data, error } = await q;

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { message: "No products found", results: [] };

  return {
    count: data.length,
    results: data.map((item) => ({
      id: item.id,
      code: item.product_code,
      name: item.name,
      type: item.type,
      unit: item.base_unit,
      cost: item.cost_per_unit,
      price: item.price,
      available: item.is_available,
      nutrition: {
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        allergens: item.allergens,
      },
    })),
  };
}
