/**
 * update-equipment — Update equipment specs (capacity, timing, notes, category).
 * Used by Chef to enrich equipment cards after CapEx creation.
 */

import { getSupabase } from "../lib/supabase.js";

export interface UpdateEquipmentArgs {
  equipment_id: string;
  name?: string;
  category?: string;
  status?: string;
  is_available?: boolean;
  capacity?: number;
  capacity_unit?: string;
  processing_time_min?: number;
  setup_time_min?: number;
  max_parallel?: number;
  notes?: string;
}

export async function updateEquipment(args: UpdateEquipmentArgs) {
  const sb = getSupabase();

  if (!args.equipment_id) {
    return { ok: false, error: "equipment_id is required" };
  }

  // Verify equipment exists
  const { data: existing, error: fetchErr } = await sb
    .from("equipment")
    .select("id, name, category, status")
    .eq("id", args.equipment_id)
    .single();

  if (fetchErr || !existing) {
    return { ok: false, error: `Equipment not found: ${args.equipment_id}` };
  }

  const update: Record<string, unknown> = {};
  if (args.name != null) update.name = args.name;
  if (args.category != null) update.category = args.category;
  if (args.status != null) update.status = args.status;
  if (args.is_available != null) update.is_available = args.is_available;
  if (args.capacity != null) update.capacity = args.capacity;
  if (args.capacity_unit != null) update.capacity_unit = args.capacity_unit;
  if (args.processing_time_min != null) update.processing_time_min = args.processing_time_min;
  if (args.setup_time_min != null) update.setup_time_min = args.setup_time_min;
  if (args.max_parallel != null) update.max_parallel = args.max_parallel;
  if (args.notes != null) update.notes = args.notes;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No fields to update" };
  }

  const { data, error } = await sb
    .from("equipment")
    .update(update)
    .eq("id", args.equipment_id)
    .select("id, name, category, status, is_available, capacity, capacity_unit, processing_time_min, setup_time_min, max_parallel, notes")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, updated: data };
}
