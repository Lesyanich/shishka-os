/**
 * search-suppliers — Query suppliers table
 *
 * Supports name search and category filtering.
 * Note: suppliers table uses is_deleted (not is_active), contact_info (not contact_name)
 */

import { getSupabase } from "../lib/supabase.js";

export interface SearchSuppliersArgs {
  query?: string;
  category_code?: number;
  limit?: number;
}

export async function searchSuppliers(args: SearchSuppliersArgs) {
  const sb = getSupabase();
  const limit = args.limit || 30;

  let q = sb
    .from("suppliers")
    .select("id, name, category_code, contact_info, is_deleted, created_at")
    .eq("is_deleted", false)
    .order("name")
    .limit(limit);

  if (args.query) {
    q = q.or(`name.ilike.%${args.query}%,contact_info.ilike.%${args.query}%`);
  }

  if (args.category_code) {
    q = q.eq("category_code", args.category_code);
  }

  const { data, error } = await q;

  if (error) return { error: error.message };
  if (!data || data.length === 0)
    return { message: "No suppliers found", results: [] };

  return {
    count: data.length,
    results: data.map((s) => ({
      id: s.id,
      name: s.name,
      category_code: s.category_code,
      contact_info: s.contact_info,
    })),
  };
}
