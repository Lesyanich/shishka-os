import { getSupabase } from "../lib/supabase.js";

export const listEquipmentSchema = {
  name: "list_equipment",
  description:
    "List kitchen equipment with category, status, and STATION ZONE (L1 Kitchen vs L2 Service). This is the LIVE source of truth for what equipment exists and WHERE — use it (not any static doc) for RULE-EQUIPMENT-REALITY when designing a production flow: confirm the machine exists and read its `zone` before placing a heat/char/finish step there. Returns `zone` (L1|L2), `location_zone`, `location_notes`, `is_bottleneck`, `preheat_min`. Supports multilingual search — query in English, Russian, Arabic, or Thai.",
  inputSchema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description:
          "Filter by equipment category (e.g., 'oven', 'mixer', 'stove'). Leave empty for all.",
      },
      name_search: {
        type: "string",
        description:
          "Search equipment by name or alias in any language (e.g., 'лава-гриль', 'vacuum', 'เตาอบ', 'فرن'). Matches against name and aliases fields.",
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
  name_search?: string;
  available_only?: boolean;
}) {
  try {
    const sb = getSupabase();

    // Try enriched schema with aliases (post-migration 142)
    const enriched = await sb
      .from("equipment")
      .select("id, equipment_code, name, aliases, category, status, capacity, capacity_unit, is_available, processing_time_min, setup_time_min, max_parallel, notes, last_service_date, daily_availability_min, location_zone, location_notes, is_bottleneck, preheat_min")
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

    // Filter by category
    let filtered = data;
    if (args.category && isEnriched) {
      filtered = data.filter((eq: any) =>
        eq.category && eq.category.toLowerCase().includes(args.category!.toLowerCase())
      );
    } else if (args.category) {
      filtered = data.filter((eq: any) =>
        eq.name && eq.name.toLowerCase().includes(args.category!.toLowerCase())
      );
    }

    // Filter by name_search — matches name OR any alias (multilingual)
    if (args.name_search) {
      const q = args.name_search.toLowerCase();
      filtered = filtered.filter((eq: any) => {
        if (eq.name && eq.name.toLowerCase().includes(q)) return true;
        if (eq.equipment_code && eq.equipment_code.toLowerCase().includes(q)) return true;
        if (Array.isArray(eq.aliases)) {
          return eq.aliases.some((alias: string) => alias.toLowerCase().includes(q));
        }
        return false;
      });
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
        // Zone is the authoritative station location. Prefer the explicit
        // location_zone column; otherwise derive L1/L2 from the equipment_code
        // prefix (L-1-* = L1 Kitchen, L-2-* = L2 Service). This is what the
        // Chef Agent's RULE-EQUIPMENT-REALITY check reads — the LIVE source of
        // truth, not the (lagging) operations.md snapshot.
        const codePrefixZone = /^L-1\b|^L-1-/.test(eq.equipment_code || "")
          ? "L1"
          : /^L-2\b|^L-2-/.test(eq.equipment_code || "")
            ? "L2"
            : null;
        const result: Record<string, any> = {
          id: eq.id,
          equipment_code: eq.equipment_code,
          name: eq.name,
          zone: codePrefixZone, // L1 | L2 | null (unknown — verify via location_notes)
          capacity_unit: eq.capacity_unit,
          last_service_date: eq.last_service_date,
        };
        if (isEnriched) {
          result.category = eq.category;
          result.status = eq.status;
          result.is_available = eq.is_available;
          result.location_zone = eq.location_zone; // sub-zone within L1/L2 (e.g. "Hot")
          result.location_notes = eq.location_notes;
          result.is_bottleneck = eq.is_bottleneck;
          result.capacity = eq.capacity;
          result.preheat_min = eq.preheat_min;
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
