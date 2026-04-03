import { getSupabase } from "../lib/supabase.js";
import { validateNutrition } from "../lib/validators.js";

export const updateProductSchema = {
  name: "update_product",
  description:
    "Update an existing product's metadata: nutrition, allergens, name, price, availability. " +
    "Cannot change product_code or type. NEVER set cost_per_unit — it's auto-calculated.",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "UUID of the product to update",
      },
      name: {
        type: "string",
        description: "New human-readable name (English only)",
      },
      calories: {
        type: "number",
        description:
          "Calories (kcal) per 1 base_unit — NOT per 100g! For kg: multiply standard per-100g value by 10.",
      },
      protein: {
        type: "number",
        description: "Protein (g) per 1 base_unit — NOT per 100g!",
      },
      carbs: {
        type: "number",
        description: "Carbs (g) per 1 base_unit — NOT per 100g!",
      },
      fat: {
        type: "number",
        description: "Fat (g) per 1 base_unit — NOT per 100g!",
      },
      allergens: {
        type: "array",
        items: { type: "string" },
        description: "Updated list of allergens. Pass empty array to clear.",
      },
      price: {
        type: "number",
        description: "Selling price in THB (only for SALE items)",
      },
      is_available: {
        type: "boolean",
        description: "Set availability status",
      },
    },
    required: ["product_id"],
  },
};

export async function updateProduct(args: {
  product_id: string;
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  allergens?: string[];
  price?: number;
  is_available?: boolean;
}) {
  try {
    const sb = getSupabase();

    // Fetch current product to validate
    const { data: current, error: fetchErr } = await sb
      .from("nomenclature")
      .select("id, product_code, name, type, base_unit, price, calories, protein, carbs, fat, allergens, is_available")
      .eq("id", args.product_id)
      .single();

    if (fetchErr || !current) {
      return { error: `Product not found: ${args.product_id}` };
    }

    const prefix = current.product_code.split("-")[0];

    // Validate nutrition if provided
    if (args.calories !== undefined || args.protein !== undefined || args.carbs !== undefined || args.fat !== undefined) {
      if (prefix !== "RAW") {
        return {
          error: `Only RAW items should have direct nutrition values. ${prefix} items calculate nutrition from their BOM.`,
        };
      }

      const nutritionErr = validateNutrition(
        {
          calories: args.calories,
          protein: args.protein,
          carbs: args.carbs,
          fat: args.fat,
        },
        current.base_unit,
      );
      if (nutritionErr) return { error: nutritionErr };
    }

    // Validate price
    if (args.price !== undefined && prefix !== "SALE") {
      return {
        error: `Only SALE items can have a price. ${prefix} items get cost from purchases.`,
      };
    }

    // Build update object — only include provided fields
    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.calories !== undefined) updates.calories = args.calories;
    if (args.protein !== undefined) updates.protein = args.protein;
    if (args.carbs !== undefined) updates.carbs = args.carbs;
    if (args.fat !== undefined) updates.fat = args.fat;
    if (args.allergens !== undefined) updates.allergens = args.allergens;
    if (args.price !== undefined) updates.price = args.price;
    if (args.is_available !== undefined) updates.is_available = args.is_available;

    if (Object.keys(updates).length === 0) {
      return { error: "No fields to update. Provide at least one field." };
    }

    const { data, error } = await sb
      .from("nomenclature")
      .update(updates)
      .eq("id", args.product_id)
      .select("id, product_code, name, type, base_unit, price, calories, protein, carbs, fat, allergens, is_available")
      .single();

    if (error) return { error: `DB error: ${error.message}` };

    // Build change summary
    const changes: string[] = [];
    for (const [key, val] of Object.entries(updates)) {
      const old = (current as any)[key];
      changes.push(`${key}: ${JSON.stringify(old)} → ${JSON.stringify(val)}`);
    }

    return {
      success: true,
      product: {
        id: data.id,
        code: data.product_code,
        name: data.name,
        type: data.type,
        unit: data.base_unit,
        nutrition: {
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
        },
        allergens: data.allergens,
        price: data.price,
        is_available: data.is_available,
      },
      changes,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
