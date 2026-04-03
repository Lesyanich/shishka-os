import { getSupabase } from "../lib/supabase.js";

// ── Schema ──

export const manageRecipeFlowSchema = {
  name: "manage_recipe_flow",
  description:
    "Manage production flow steps for a product. " +
    "Steps define operations (marination, grilling, etc.) with equipment and duration. " +
    "Used by backward scheduling and KDS Gantt. " +
    "Actions: 'list', 'add', 'remove', 'set' (replace all steps).",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["list", "add", "remove", "set"],
        description: "Action: list, add, remove, or set (replace all steps)",
      },
      product_code: {
        type: "string",
        description:
          "Product code (e.g., PF-CHICKEN_GRILL_NEUTRAL). Required for all actions.",
      },
      step_order: {
        type: "number",
        description: "Step order number (1-based). Required for add and remove.",
      },
      operation_name: {
        type: "string",
        description:
          "Operation name (e.g., Marination, Grilling). Required for add.",
      },
      equipment_id: {
        type: "string",
        description:
          "UUID of equipment. Use list_equipment to find IDs. Optional (NULL = manual).",
      },
      duration_min: {
        type: "number",
        description: "Expected duration in minutes. Required for add.",
      },
      instruction_text: {
        type: "string",
        description: "Detailed instruction for the cook. Required for add.",
      },
      temperature_c: {
        type: "number",
        description:
          "Target equipment temperature in °C (e.g., grill 220°C). Optional.",
      },
      internal_temp_c: {
        type: "number",
        description:
          "Target internal product temperature in °C — HACCP control point (e.g., chicken 74°C). Optional.",
      },
      is_passive: {
        type: "boolean",
        description:
          "If true, cook is free during this step (marination, chilling). Affects KDS Gantt display. Default: false.",
      },
      notes: {
        type: "string",
        description: "Optional notes for this step.",
      },
      steps: {
        type: "array",
        description:
          "Array of steps for 'set' action. Each step: { step_order, operation_name, equipment_id?, duration_min, instruction_text, temperature_c?, internal_temp_c?, is_passive?, notes? }",
        items: {
          type: "object",
          properties: {
            step_order: { type: "number" },
            operation_name: { type: "string" },
            equipment_id: { type: "string" },
            duration_min: { type: "number" },
            instruction_text: { type: "string" },
            temperature_c: { type: "number" },
            internal_temp_c: { type: "number" },
            is_passive: { type: "boolean" },
            notes: { type: "string" },
          },
          required: [
            "step_order",
            "operation_name",
            "duration_min",
            "instruction_text",
          ],
        },
      },
    },
    required: ["action", "product_code"],
  },
};

// ── Handler ──

export async function manageRecipeFlow(args: {
  action: string;
  product_code: string;
  step_order?: number;
  operation_name?: string;
  equipment_id?: string;
  duration_min?: number;
  instruction_text?: string;
  temperature_c?: number;
  internal_temp_c?: number;
  is_passive?: boolean;
  notes?: string;
  steps?: Array<{
    step_order: number;
    operation_name: string;
    equipment_id?: string;
    duration_min: number;
    instruction_text: string;
    temperature_c?: number;
    internal_temp_c?: number;
    is_passive?: boolean;
    notes?: string;
  }>;
}) {
  const sb = getSupabase();
  const { action, product_code } = args;

  // Resolve product_code → nomenclature record (SSoT)
  const { data: product, error: prodErr } = await sb
    .from("nomenclature")
    .select("id, product_code, name, type")
    .eq("product_code", product_code)
    .single();

  if (prodErr || !product) {
    return { error: `Product not found: ${product_code}` };
  }

  const nomenclatureId: string = product.id;

  // ── LIST ──
  if (action === "list") {
    const { data: steps, error } = await sb
      .from("recipes_flow")
      .select(
        "id, step_order, operation_name, equipment_id, duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes, equipment(name)"
      )
      .eq("nomenclature_id", nomenclatureId)
      .order("step_order", { ascending: true });

    if (error) return { error: `Query error: ${error.message}` };

    const total_duration = (steps ?? []).reduce(
      (sum: number, s: any) => sum + (s.duration_min || 0),
      0
    );

    const active_steps = (steps ?? []).filter((s: any) => !s.is_passive);
    const active_duration = active_steps.reduce(
      (sum: number, s: any) => sum + (s.duration_min || 0),
      0
    );

    return {
      product_code,
      product_name: product.name,
      nomenclature_id: nomenclatureId,
      step_count: (steps ?? []).length,
      total_duration_min: total_duration,
      active_duration_min: active_duration,
      passive_duration_min: total_duration - active_duration,
      steps: (steps ?? []).map((s: any) => ({
        id: s.id,
        step_order: s.step_order,
        operation: s.operation_name,
        duration_min: s.duration_min,
        equipment: s.equipment?.name ?? "MANUAL",
        equipment_id: s.equipment_id,
        instruction: s.instruction_text,
        temperature_c: s.temperature_c,
        internal_temp_c: s.internal_temp_c,
        is_passive: s.is_passive,
        notes: s.notes,
      })),
    };
  }

  // ── ADD ──
  if (action === "add") {
    if (!args.operation_name || !args.duration_min || !args.instruction_text) {
      return {
        error:
          "Required for add: operation_name, duration_min, instruction_text",
      };
    }

    const stepOrder = args.step_order ?? 1;

    // Validate equipment exists if provided
    if (args.equipment_id) {
      const { data: eq, error: eqErr } = await sb
        .from("equipment")
        .select("id, name")
        .eq("id", args.equipment_id)
        .single();

      if (eqErr || !eq) {
        return {
          error: `Equipment not found: ${args.equipment_id}. Use list_equipment to find valid IDs.`,
        };
      }
    }

    const { data, error } = await sb
      .from("recipes_flow")
      .insert({
        nomenclature_id: nomenclatureId,
        step_order: stepOrder,
        operation_name: args.operation_name,
        equipment_id: args.equipment_id ?? null,
        duration_min: args.duration_min,
        instruction_text: args.instruction_text,
        temperature_c: args.temperature_c ?? null,
        internal_temp_c: args.internal_temp_c ?? null,
        is_passive: args.is_passive ?? false,
        notes: args.notes ?? null,
      })
      .select("id, step_order, operation_name, duration_min")
      .single();

    if (error) return { error: `Insert error: ${error.message}` };

    return {
      success: true,
      message: `Step ${stepOrder} "${args.operation_name}" added to ${product_code}`,
      step: data,
    };
  }

  // ── REMOVE ──
  if (action === "remove") {
    if (!args.step_order) {
      return { error: "Required for remove: step_order" };
    }

    const { data, error } = await sb
      .from("recipes_flow")
      .delete()
      .eq("nomenclature_id", nomenclatureId)
      .eq("step_order", args.step_order)
      .select("id, operation_name");

    if (error) return { error: `Delete error: ${error.message}` };
    if (!data || data.length === 0) {
      return {
        error: `No step found at order ${args.step_order} for ${product_code}`,
      };
    }

    return {
      success: true,
      message: `Removed step ${args.step_order} "${data[0].operation_name}" from ${product_code}`,
    };
  }

  // ── SET (replace all) ──
  if (action === "set") {
    if (!args.steps || args.steps.length === 0) {
      return { error: "Required for set: steps array with at least one step" };
    }

    // Validate all equipment IDs
    const equipmentIds = args.steps
      .filter((s) => s.equipment_id)
      .map((s) => s.equipment_id!);

    if (equipmentIds.length > 0) {
      const { data: eqs, error: eqErr } = await sb
        .from("equipment")
        .select("id")
        .in("id", equipmentIds);

      if (eqErr) return { error: `Equipment check error: ${eqErr.message}` };

      const foundIds = new Set((eqs ?? []).map((e: any) => e.id));
      const missing = equipmentIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return {
          error: `Equipment not found: ${missing.join(", ")}. Use list_equipment to find valid IDs.`,
        };
      }
    }

    // Delete existing steps for this product
    await sb.from("recipes_flow").delete().eq("nomenclature_id", nomenclatureId);

    // Insert new steps
    const rows = args.steps.map((s) => ({
      nomenclature_id: nomenclatureId,
      step_order: s.step_order,
      operation_name: s.operation_name,
      equipment_id: s.equipment_id ?? null,
      duration_min: s.duration_min,
      instruction_text: s.instruction_text,
      temperature_c: s.temperature_c ?? null,
      internal_temp_c: s.internal_temp_c ?? null,
      is_passive: s.is_passive ?? false,
      notes: s.notes ?? null,
    }));

    const { data, error } = await sb
      .from("recipes_flow")
      .insert(rows)
      .select("step_order, operation_name, duration_min, is_passive");

    if (error) return { error: `Insert error: ${error.message}` };

    const total_duration = (data ?? []).reduce(
      (sum: number, s: any) => sum + s.duration_min,
      0
    );

    return {
      success: true,
      message: `Set ${(data ?? []).length} steps for ${product_code} (total: ${total_duration} min)`,
      steps: data,
    };
  }

  return { error: `Unknown action: ${action}. Use list, add, remove, or set.` };
}
