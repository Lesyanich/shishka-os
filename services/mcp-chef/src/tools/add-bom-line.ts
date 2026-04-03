import { getSupabase } from "../lib/supabase.js";
import {
  validateLegoChain,
  checkCircularRef,
} from "../lib/validators.js";

export const addBomLineSchema = {
  name: "add_bom_line",
  description:
    "Add an ingredient to a product's BOM (recipe). Validates Lego chain rules (SALE→PF/MOD, PF→RAW/PF, MOD→RAW) and checks for circular references. Quantity is in the ingredient's base_unit.",
  inputSchema: {
    type: "object" as const,
    properties: {
      parent_id: {
        type: "string",
        description: "UUID of the parent product (the recipe)",
      },
      ingredient_id: {
        type: "string",
        description: "UUID of the ingredient to add",
      },
      quantity: {
        type: "number",
        description:
          "Quantity of the ingredient in its base_unit (e.g., 0.5 for 0.5 kg)",
      },
      yield_pct: {
        type: "number",
        description:
          "Yield percentage (1-100). Default: 100. Use <100 when there's waste (e.g., 85 for vegetables with peeling loss).",
      },
      sort_order: {
        type: "number",
        description: "Position in the recipe (for display ordering)",
      },
    },
    required: ["parent_id", "ingredient_id", "quantity"],
  },
};

export async function addBomLine(args: {
  parent_id: string;
  ingredient_id: string;
  quantity: number;
  yield_pct?: number;
  sort_order?: number;
}) {
  try {
    const sb = getSupabase();

    // Fetch both products
    const { data: products, error: fetchErr } = await sb
      .from("nomenclature")
      .select("id, product_code, name, type, base_unit")
      .in("id", [args.parent_id, args.ingredient_id]);

    if (fetchErr) return { error: `DB error: ${fetchErr.message}` };
    if (!products || products.length < 2) {
      const found = products?.map((p) => p.id) || [];
      const missing = [args.parent_id, args.ingredient_id].filter(
        (id) => !found.includes(id)
      );
      return { error: `Product(s) not found: ${missing.join(", ")}` };
    }

    const parent = products.find((p) => p.id === args.parent_id)!;
    const ingredient = products.find((p) => p.id === args.ingredient_id)!;

    // Validate Lego chain
    const chainErr = validateLegoChain(
      parent.product_code,
      ingredient.product_code
    );
    if (chainErr) return { error: chainErr };

    // Check circular references
    const circErr = await checkCircularRef(args.parent_id, args.ingredient_id);
    if (circErr) return { error: circErr };

    // Validate quantity
    if (args.quantity <= 0) return { error: "Quantity must be positive" };

    // Validate yield_pct → convert to yield_loss_pct for DB
    // User provides yield_pct (e.g., 85 = 85% usable output)
    // DB stores yield_loss_pct (e.g., 15 = 15% lost)
    const yieldPct = args.yield_pct ?? 100;
    if (yieldPct <= 0 || yieldPct > 100) {
      return { error: "yield_pct must be between 1 and 100" };
    }
    const yieldLossPct = yieldPct < 100 ? (100 - yieldPct) : null;

    // Check for duplicate
    const { data: existing } = await sb
      .from("bom_structures")
      .select("id")
      .eq("parent_id", args.parent_id)
      .eq("ingredient_id", args.ingredient_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return {
        error: `${ingredient.product_code} is already in ${parent.product_code}'s BOM. Use update or remove first.`,
      };
    }

    // Insert using real DB column names:
    //   quantity_per_unit (not quantity)
    //   yield_loss_pct (not yield_pct) — stored as LOSS percentage
    //   no sort_order column exists
    const { data, error } = await sb
      .from("bom_structures")
      .insert({
        parent_id: args.parent_id,
        ingredient_id: args.ingredient_id,
        quantity_per_unit: args.quantity,
        yield_loss_pct: yieldLossPct,
      })
      .select()
      .single();

    if (error) return { error: `DB error: ${error.message}` };

    return {
      success: true,
      bom_line: {
        id: data.id,
        parent: parent.product_code,
        ingredient: ingredient.product_code,
        ingredient_name: ingredient.name,
        quantity: args.quantity,
        unit: ingredient.base_unit,
        yield_pct: yieldPct,
        yield_loss_pct: yieldLossPct,
      },
      hint: `Added ${args.quantity} ${ingredient.base_unit} of ${ingredient.product_code} to ${parent.product_code}.`,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
