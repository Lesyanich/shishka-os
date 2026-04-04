import { getSupabase } from "../lib/supabase.js";

export const removeBomLineSchema = {
  name: "remove_bom_line",
  description:
    "Remove an ingredient from a product's BOM. Specify parent and ingredient, or the BOM line ID directly.",
  inputSchema: {
    type: "object" as const,
    properties: {
      bom_line_id: {
        type: "string",
        description: "UUID of the BOM line to remove (if known)",
      },
      parent_id: {
        type: "string",
        description: "UUID of the parent product",
      },
      ingredient_id: {
        type: "string",
        description: "UUID of the ingredient to remove",
      },
    },
  },
};

export async function removeBomLine(args: {
  bom_line_id?: string;
  parent_id?: string;
  ingredient_id?: string;
}) {
  try {
    const sb = getSupabase();

    if (!args.bom_line_id && !(args.parent_id && args.ingredient_id)) {
      return {
        error:
          "Provide either bom_line_id, or both parent_id and ingredient_id.",
      };
    }

    // Find the BOM line
    let query = sb
      .from("bom_structures")
      .select(
        "id, parent_id, ingredient_id, quantity_per_unit, parent:nomenclature!bom_structures_parent_id_fkey(product_code, name), ingredient:nomenclature!bom_structures_ingredient_id_fkey(product_code, name)"
      );

    if (args.bom_line_id) {
      query = query.eq("id", args.bom_line_id);
    } else {
      query = query
        .eq("parent_id", args.parent_id!)
        .eq("ingredient_id", args.ingredient_id!);
    }

    const { data: lines, error: findErr } = await query.limit(1);

    if (findErr) return { error: `DB error: ${findErr.message}` };
    if (!lines || lines.length === 0) {
      return { error: "BOM line not found" };
    }

    const line = lines[0] as any;

    // Delete
    const { error: delErr } = await sb
      .from("bom_structures")
      .delete()
      .eq("id", line.id);

    if (delErr) return { error: `DB error: ${delErr.message}` };

    return {
      success: true,
      removed: {
        bom_line_id: line.id,
        parent: line.parent?.product_code,
        ingredient: line.ingredient?.product_code,
        ingredient_name: line.ingredient?.name,
        quantity: line.quantity_per_unit,
      },
      hint: `Removed ${line.ingredient?.product_code} from ${line.parent?.product_code}'s BOM.`,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
