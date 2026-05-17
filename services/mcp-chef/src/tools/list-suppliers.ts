/**
 * list-suppliers — Query suppliers table from Chef MCP
 *
 * Bridges the gap where suppliers created by Finance (approve_receipt)
 * were invisible to Chef because search_products only joins supplier_catalog.
 * This tool queries the suppliers table directly.
 */

import { getSupabase } from "../lib/supabase.js";

export async function listSuppliers(args: {
  query?: string;
  category_code?: number;
  limit?: number;
}) {
  const sb = getSupabase();
  const limit = args.limit || 30;

  let q = sb
    .from("suppliers")
    .select(
      "id, name, category_code, contact_info, supplier_catalog(count)"
    )
    .eq("is_deleted", false)
    .order("name")
    .limit(limit);

  if (args.query) {
    q = q.or(
      `name.ilike.%${args.query}%,contact_info.ilike.%${args.query}%`
    );
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
    results: data.map((s: any) => ({
      id: s.id,
      name: s.name,
      category_code: s.category_code,
      contact_info: s.contact_info,
      linked_products: s.supplier_catalog?.[0]?.count ?? 0,
    })),
  };
}
