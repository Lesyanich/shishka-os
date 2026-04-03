/**
 * search-categories — Query fin_categories + fin_sub_categories
 *
 * Returns the financial category tree for expense classification.
 * Note: fin_categories uses "type" (Asset/Expense), not "flow_type"
 */

import { getSupabase } from "../lib/supabase.js";

export interface SearchCategoriesArgs {
  flow_type?: string;
}

export async function searchCategories(args: SearchCategoriesArgs) {
  const sb = getSupabase();

  // Fetch categories and sub-categories in parallel
  const [cats, subs] = await Promise.all([
    sb
      .from("fin_categories")
      .select("code, name, type, wht_percent, comment")
      .order("code"),
    sb
      .from("fin_sub_categories")
      .select("sub_code, name, category_code, wht_percent")
      .order("sub_code"),
  ]);

  if (cats.error) return { error: cats.error.message };
  if (subs.error) return { error: subs.error.message };

  let categories = cats.data || [];
  const subCategories = subs.data || [];

  // Filter by type if specified (maps flow_type concept to DB "type" column)
  // COGS → code 4000-4999, OpEx → code 2000-3999, CapEx → code 1000-1999
  if (args.flow_type) {
    const ft = args.flow_type.toLowerCase();
    if (ft === "cogs") {
      categories = categories.filter((c) => c.code >= 4000 && c.code < 5000);
    } else if (ft === "opex") {
      categories = categories.filter((c) => c.code >= 2000 && c.code < 4000);
    } else if (ft === "capex") {
      categories = categories.filter((c) => c.code >= 1000 && c.code < 2000);
    }
  }

  // Build tree
  const tree = categories.map((cat) => ({
    code: cat.code,
    name: cat.name,
    type: cat.type,
    wht_percent: cat.wht_percent,
    comment: cat.comment,
    sub_categories: subCategories
      .filter((s) => s.category_code === cat.code)
      .map((s) => ({
        sub_code: s.sub_code,
        name: s.name,
        wht_percent: s.wht_percent,
      })),
  }));

  return {
    count: tree.length,
    categories: tree,
  };
}
