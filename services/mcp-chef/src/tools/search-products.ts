import { getSupabase } from "../lib/supabase.js";

export const searchProductsSchema = {
  name: "search_products",
  description:
    "Search the product catalog (nomenclature). Returns matching items with nutrition, cost, and availability. Use to find ingredients, semi-finished products, modifiers, or dishes. Supports multilingual search — query in English, Russian, Arabic, or Thai.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search term in any language (matches product_code, name, or aliases). Examples: 'борщ', 'borscht', 'chicken', 'курица', 'دجاج'",
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

  // Search by product_code, name, and aliases (multilingual)
  // aliases is text[] — use cs (contains) operator for array search
  let q = sb
    .from("nomenclature")
    .select(
      "id, product_code, name, aliases, type, base_unit, cost_per_unit, price, calories, protein, carbs, fat, allergens, is_available"
    )
    .or(`product_code.ilike.%${args.query}%,name.ilike.%${args.query}%`)
    .order("product_code")
    .limit(limit);

  if (args.type) {
    q = q.ilike("product_code", `${args.type}-%`);
  }

  const { data, error } = await q;

  // If no results from name/code search, try aliases (client-side filter on full scan)
  // This handles multilingual queries like "борщ", "شوربة", "ต้มยำ"
  let results = data;
  if ((!data || data.length === 0) && args.query) {
    const aliasQuery = sb
      .from("nomenclature")
      .select(
        "id, product_code, name, aliases, type, base_unit, cost_per_unit, price, calories, protein, carbs, fat, allergens, is_available"
      )
      .order("product_code")
      .limit(200);

    if (args.type) {
      aliasQuery.ilike("product_code", `${args.type}-%`);
    }

    const aliasResult = await aliasQuery;
    if (aliasResult.error) return { error: aliasResult.error.message };

    const q_lower = args.query.toLowerCase();
    results = (aliasResult.data || []).filter((item: any) =>
      Array.isArray(item.aliases) &&
      item.aliases.some((alias: string) => alias.toLowerCase().includes(q_lower))
    ).slice(0, limit);
  }

  if (error && !results) return { error: error.message };
  if (!results || results.length === 0) return { message: "No products found", results: [] };

  return {
    count: results.length,
    results: results.map((item: any) => ({
      id: item.id,
      code: item.product_code,
      name: item.name,
      aliases: item.aliases?.length ? item.aliases : undefined,
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
