/**
 * manage-capex-assets — Create, update, or list CapEx assets
 *
 * Handles capex_assets + optional equipment linkage.
 * Use after approve_receipt for CapEx flow to register equipment on balance.
 */

import { getSupabase } from "../lib/supabase.js";

export interface ManageCapexAssetsArgs {
  action: "create" | "update" | "list";
  // create fields
  asset_name?: string;
  vendor?: string;
  initial_value?: number;
  residual_value?: number;
  useful_life_months?: number;
  purchase_date?: string;
  category_code?: number;
  equipment_id?: string;
  equipment_name?: string;
  equipment_category?: string;
  // update fields
  asset_id?: string;
  // list filters
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export async function manageCapexAssets(args: ManageCapexAssetsArgs) {
  const sb = getSupabase();

  if (args.action === "create") {
    if (!args.asset_name) {
      return { ok: false, error: "asset_name is required for create" };
    }
    if (args.initial_value == null) {
      return { ok: false, error: "initial_value is required for create" };
    }

    let equipmentId = args.equipment_id || null;

    // Auto-create equipment if equipment_name provided but no equipment_id
    if (!equipmentId && args.equipment_name) {
      // Generate equipment_code from category + timestamp
      const catPrefix = (args.equipment_category || "infra").slice(0, 4).toUpperCase();
      const seq = Date.now().toString(36).slice(-5).toUpperCase();
      const equipmentCode = `EQ-${catPrefix}-${seq}`;

      const { data: eq, error: eqErr } = await sb
        .from("equipment")
        .insert({
          equipment_code: equipmentCode,
          name: args.equipment_name,
          category: args.equipment_category || "infrastructure",
          status: "active",
          is_available: true,
        })
        .select("id, equipment_code")
        .single();

      if (eqErr) {
        return { ok: false, error: `Failed to create equipment: ${eqErr.message}` };
      }
      equipmentId = eq.id;
    }

    const { data, error } = await sb
      .from("capex_assets")
      .insert({
        asset_name: args.asset_name,
        vendor: args.vendor || null,
        initial_value: args.initial_value,
        residual_value: args.residual_value ?? 0,
        useful_life_months: args.useful_life_months ?? 60,
        purchase_date: args.purchase_date || null,
        category_code: args.category_code || null,
        equipment_id: equipmentId,
      })
      .select("id, asset_name, equipment_id, initial_value, useful_life_months")
      .single();

    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      asset: data,
      equipment_created: !args.equipment_id && !!equipmentId,
      equipment_id: equipmentId,
    };
  }

  if (args.action === "update") {
    if (!args.asset_id) {
      return { ok: false, error: "asset_id is required for update" };
    }

    const update: Record<string, unknown> = {};
    if (args.asset_name) update.asset_name = args.asset_name;
    if (args.vendor) update.vendor = args.vendor;
    if (args.initial_value != null) update.initial_value = args.initial_value;
    if (args.residual_value != null) update.residual_value = args.residual_value;
    if (args.useful_life_months != null) update.useful_life_months = args.useful_life_months;
    if (args.purchase_date) update.purchase_date = args.purchase_date;
    if (args.category_code != null) update.category_code = args.category_code;
    if (args.equipment_id) update.equipment_id = args.equipment_id;

    if (Object.keys(update).length === 0) {
      return { ok: false, error: "No fields to update" };
    }

    const { data, error } = await sb
      .from("capex_assets")
      .update(update)
      .eq("id", args.asset_id)
      .select("id, asset_name, equipment_id, initial_value, useful_life_months")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, updated: data };
  }

  if (args.action === "list") {
    let query = sb
      .from("capex_assets")
      .select("id, asset_name, vendor, initial_value, residual_value, useful_life_months, purchase_date, category_code, equipment_id, created_at")
      .order("created_at", { ascending: false })
      .limit(args.limit || 20);

    if (args.vendor) query = query.ilike("vendor", `%${args.vendor}%`);
    if (args.date_from) query = query.gte("purchase_date", args.date_from);
    if (args.date_to) query = query.lte("purchase_date", args.date_to);

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: data?.length || 0, assets: data };
  }

  return { ok: false, error: `Unknown action: ${args.action}` };
}
