/**
 * search-nomenclature — READ-ONLY access to nomenclature table
 *
 * Finance agent can search products for matching during receipt processing,
 * but cannot create or modify products (that's Chef's domain).
 */

import { getSupabase } from "../lib/supabase.js";

export interface SearchNomenclatureArgs {
  query: string;
  type?: string;
  limit?: number;
}

export async function searchNomenclature(args: SearchNomenclatureArgs) {
  const sb = getSupabase();
  const limit = args.limit || 20;

  let q = sb
    .from("nomenclature")
    .select(
      "id, product_code, name, type, base_unit, cost_per_unit, is_available"
    )
    .or(`product_code.ilike.%${args.query}%,name.ilike.%${args.query}%`)
    .order("product_code")
    .limit(limit);

  if (args.type) {
    q = q.ilike("product_code", `${args.type}-%`);
  }

  const { data, error } = await q;

  if (error) return { error: error.message };
  if (!data || data.length === 0)
    return { message: "No products found", results: [] };

  return {
    count: data.length,
    results: data.map((item) => ({
      id: item.id,
      code: item.product_code,
      name: item.name,
      type: item.type,
      unit: item.base_unit,
      cost: item.cost_per_unit,
      available: item.is_available,
    })),
  };
}
