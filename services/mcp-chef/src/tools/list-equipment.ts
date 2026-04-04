import { getSupabase } from "../lib/supabase.js";

export const listEquipmentSchema = {
  name: "list_equipment",
  description:
    "List kitchen equipment with category and status. Use to check what equipment exists for recipe planning and production scheduling.",
  inputSchema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description:
          "Filter by equipment category (e.g., 'oven', 'mixer', 'stove'). Leave empty for all.",
      },
      available_only: {
        type: "boolean",
        description: "If true, only show equipment with status != 'out_of_service' (default: false)",
      },
    },
  },
};

export async function listEquipment(args: {
  category?: string;
  available_only?: boolean;
}) {
  try {
    const sb = getSupabase();

    // Equipment schema (current real DB):
    //   id (UUID), equipment_code (TEXT), name (TEXT), capacity_unit (TEXT),
    //   capacity_uom (GENERATED), unit_id (TEXT), syrve_uuid (UUID),
    //   last_service_date (DATE), daily_availability_min (NUMERIC)
    //
    // After migration 070 will also have:
    //   category, status, is_available, capacity, processing_time_min,
    //   setup_time_min, max_parallel, notes

    // Try enriched schema first (post-migration 070)
    const enriched = await sb
      .from("equipment")
      .select("id, equipment_code, name, category, status, capacity, capacity_unit, is_available, processing_time_min, setup_time_min, max_parallel, notes, last_service_date, daily_availability_min")
      .order("name");

    let data: any[] | null = null;
    let isEnriched = true;

    if (enriched.error) {
      // Fallback: pre-migration 070 schema
      isEnriched = false;
      const basic = await sb
        .from("equipment")
        .select("id, equipment_code, name, capacity_unit, last_service_date, daily_availability_min")
        .order("name");

      if (basic.error) return { error: basic.error.message };
      data = basic.data;
    } else {
      data = enriched.data;
    }

    if (!data || data.length === 0)
      return { message: "No equipment found", results: [] };

    // Filter by category (only if enriched schema)
    let filtered = data;
    if (args.category && isEnriched) {
      filtered = data.filter((eq: any) =>
        eq.category && eq.category.toLowerCase().includes(args.category!.toLowerCase())
      );
    } else if (args.category) {
      // Pre-migration: filter by name (best we can do)
      filtered = data.filter((eq: any) =>
        eq.name && eq.name.toLowerCase().includes(args.category!.toLowerCase())
      );
    }

    if (args.available_only && isEnriched) {
      filtered = filtered.filter((eq: any) => eq.is_available !== false);
    }

    // Group by category or infer from name
    const byCategory: Record<string, number> = {};
    for (const eq of filtered) {
      const cat = (eq as any).category || "uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return {
      count: filtered.length,
      schema_version: isEnriched ? "enriched (migration 070)" : "basic (pre-070)",
      categories: isEnriched ? byCategory : undefined,
      results: filtered.map((eq: any) => {
        const result: Record<string, any> = {
          id: eq.id,
          equipment_code: eq.equipment_code,
          name: eq.name,
          capacity_unit: eq.capacity_unit,
          last_service_date: eq.last_service_date,
        };
        if (isEnriched) {
          result.category = eq.category;
          result.status = eq.status;
          result.is_available = eq.is_available;
          result.capacity = eq.capacity;
          result.processing_time_min = eq.processing_time_min;
          result.setup_time_min = eq.setup_time_min;
          result.max_parallel = eq.max_parallel;
          result.notes = eq.notes;
        }
        return result;
      }),
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
