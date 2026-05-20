import { getSupabase } from "../lib/supabase.js";

export const searchProductsSchema = {
  name: "search_products",
  description:
    "Search the product catalog (nomenclature). Returns matching items with barcodes, nutrition, cost, and availability. Use to find ingredients, semi-finished products, modifiers, or dishes. Supports multilingual search — query in English, Russian, Arabic, or Thai. Can also browse by category (e.g. 'show all mushrooms' → category='F-PRD-MSH').",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search term in any language (matches product_code, name, or aliases). Examples: 'борщ', 'borscht', 'chicken', 'курица', 'دجاج'. Optional when category is provided.",
      },
      type: {
        type: "string",
        enum: ["RAW", "PF", "MOD", "SALE"],
        description:
          "Filter by product type prefix. RAW = raw ingredients, PF = semi-finished, MOD = modifiers/toppings, SALE = finished dishes",
      },
      category: {
        type: "string",
        description:
          "Filter by product category code (L1/L2/L3). L3 exact match (e.g. 'F-PRD-MSH' for mushrooms). L2 matches all children (e.g. 'F-PRD' for all produce). L1 matches all descendants (e.g. 'F' for all food). Use without query to browse a whole category.",
      },
      limit: {
        type: "number",
        description: "Max results (default: 20)",
      },
    },
    required: [],
  },
};

export async function searchProducts(args: {
  query?: string;
  type?: string;
  category?: string;
  limit?: number;
}) {
  if (!args.query && !args.category) {
    return { error: "Either query or category must be provided" };
  }

  const sb = getSupabase();
  const limit = args.limit || 20;

  const selectFields =
    "id, product_code, name, aliases, type, base_unit, cost_per_unit, price, calories, protein, carbs, fat, allergens, is_available, category:product_categories(code, name), sku(barcode), supplier_catalog(barcode)";

  // Resolve category code → array of category UUIDs for filtering
  async function resolveCategoryIds(catCode: string): Promise<string[] | null> {
    const dashes = (catCode.match(/-/g) || []).length;
    let catQuery;
    if (dashes >= 2) {
      // L3 exact match
      catQuery = sb.from("product_categories").select("id").eq("code", catCode);
    } else {
      // L1 or L2 prefix — match all descendants
      catQuery = sb.from("product_categories").select("id").or(`code.eq.${catCode},code.ilike.${catCode}-%`);
    }
    const { data } = await catQuery;
    if (!data || data.length === 0) return null;
    return data.map((c: any) => c.id);
  }

  // If category filter requested, resolve IDs first
  let categoryIds: string[] | null = null;
  if (args.category) {
    categoryIds = await resolveCategoryIds(args.category);
    if (!categoryIds) {
      return { error: `Unknown category code: ${args.category}`, results: [] };
    }
  }

  let q = sb
    .from("nomenclature")
    .select(selectFields)
    .order("product_code")
    .limit(limit);

  // Apply text search if query provided
  if (args.query) {
    q = q.or(`product_code.ilike.%${args.query}%,name.ilike.%${args.query}%`);
  }

  if (args.type) {
    q = q.ilike("product_code", `${args.type}-%`);
  }

  if (categoryIds) {
    q = q.in("category_id", categoryIds);
  }

  const { data, error } = await q;

  // If no results from name/code search, try aliases (client-side filter on full scan)
  // This handles multilingual queries like "борщ", "شوربة", "ต้มยำ"
  let results = data;
  if ((!data || data.length === 0) && args.query) {
    let aliasQuery = sb
      .from("nomenclature")
      .select(selectFields)
      .order("product_code")
      .limit(200);

    if (args.type) {
      aliasQuery = aliasQuery.ilike("product_code", `${args.type}-%`);
    }
    if (categoryIds) {
      aliasQuery = aliasQuery.in("category_id", categoryIds);
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
    results: results.map((item: any) => {
      // Collect unique barcodes from sku and supplier_catalog joins
      const barcodes = [
        ...((item.sku || []) as any[]).map((s: any) => s.barcode),
        ...((item.supplier_catalog || []) as any[]).map((s: any) => s.barcode),
      ].filter((b): b is string => !!b);
      const uniqueBarcodes = [...new Set(barcodes)];

      return {
        id: item.id,
        code: item.product_code,
        name: item.name,
        aliases: item.aliases?.length ? item.aliases : undefined,
        type: item.type,
        category: item.category ? { code: item.category.code, name: item.category.name } : undefined,
        unit: item.base_unit,
        cost: item.cost_per_unit,
        price: item.price,
        available: item.is_available,
        barcodes: uniqueBarcodes.length ? uniqueBarcodes : undefined,
        nutrition: {
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          allergens: item.allergens,
        },
      };
    }),
  };
}
