/**
 * manage-suppliers — Create and update suppliers
 *
 * Finance agent owns the supplier lifecycle.
 * DB schema: id, name, contact_info, category_code, is_deleted, created_at, updated_at
 */

import { getSupabase } from "../lib/supabase.js";

export interface ManageSuppliersArgs {
  action: string;
  supplier_id?: string;
  name?: string;
  category_code?: number;
  contact_info?: string;
  is_active?: boolean;
}

export async function manageSuppliers(args: ManageSuppliersArgs) {
  const sb = getSupabase();

  if (args.action === "create") {
    if (!args.name) {
      return { ok: false, error: "Supplier name is required" };
    }

    // Check for duplicate
    const { data: existing } = await sb
      .from("suppliers")
      .select("id, name")
      .ilike("name", `%${args.name}%`)
      .eq("is_deleted", false)
      .limit(5);

    if (existing && existing.length > 0) {
      return {
        ok: false,
        warning: "Potential duplicate suppliers found",
        matches: existing,
        hint: "Use an existing supplier_id, or proceed if this is a genuinely new supplier",
      };
    }

    const { data, error } = await sb
      .from("suppliers")
      .insert({
        name: args.name,
        category_code: args.category_code || 2000,
        contact_info: args.contact_info || null,
        is_deleted: false,
      })
      .select("id, name, category_code")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, action: "created", supplier: data };
  }

  if (args.action === "update") {
    if (!args.supplier_id) {
      return { ok: false, error: "supplier_id is required for update" };
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.category_code !== undefined) updates.category_code = args.category_code;
    if (args.contact_info !== undefined) updates.contact_info = args.contact_info;
    if (args.is_active !== undefined) updates.is_deleted = !args.is_active;

    if (Object.keys(updates).length === 0) {
      return { ok: false, error: "No fields to update" };
    }

    const { data, error } = await sb
      .from("suppliers")
      .update(updates)
      .eq("id", args.supplier_id)
      .select("id, name, category_code, is_deleted")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, action: "updated", supplier: data };
  }

  return { ok: false, error: `Unknown action: ${args.action}. Use 'create' or 'update'` };
}
