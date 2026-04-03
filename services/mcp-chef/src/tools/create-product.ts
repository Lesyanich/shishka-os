import { getSupabase } from "../lib/supabase.js";
import {
  validateProductCode,
  validateBaseUnit,
  validateNutrition,
  checkCodeUnique,
  findSimilarProducts,
  checkSupplierAvailability,
} from "../lib/validators.js";

export const createProductSchema = {
  name: "create_product",
  description:
    "Create a new product in the nomenclature. Validates code format, checks for duplicates (fuzzy name match), checks supplier availability for RAW items. NEVER set cost_per_unit — it's auto-calculated by DB trigger.",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_code: {
        type: "string",
        description:
          "Product code: PREFIX-NAME_PARTS. Prefix: RAW/PF/MOD/SALE. Name: ALL_CAPS_UNDERSCORES. Example: RAW-ROMAINE_LETTUCE",
      },
      name: {
        type: "string",
        description: "Human-readable product name (English only per chef preferences)",
      },
      base_unit: {
        type: "string",
        enum: ["kg", "g", "L", "ml", "pcs"],
        description: "Base unit of measurement",
      },
      price: {
        type: "number",
        description: "Selling price in THB (only for SALE items)",
      },
      calories: {
        type: "number",
        description: "Calories (kcal) per 1 base_unit — NOT per 100g! For kg items: multiply standard per-100g value by 10. Example: chicken breast = 1650 kcal/kg (not 165). Only for RAW items.",
      },
      protein: {
        type: "number",
        description: "Protein (g) per 1 base_unit — NOT per 100g! For kg items: multiply by 10. Example: chicken breast = 310 g/kg. Only for RAW items.",
      },
      carbs: {
        type: "number",
        description: "Carbs (g) per 1 base_unit — NOT per 100g! For kg items: multiply by 10. Only for RAW items.",
      },
      fat: {
        type: "number",
        description: "Fat (g) per 1 base_unit — NOT per 100g! For kg items: multiply by 10. Only for RAW items.",
      },
      allergens: {
        type: "array",
        items: { type: "string" },
        description: "List of allergens. Only for RAW items.",
      },
      confirmed: {
        type: "boolean",
        description:
          "Set to true to skip duplicate/supplier warnings and force creation. Use ONLY after user has reviewed and confirmed the warnings.",
      },
    },
    required: ["product_code", "name", "base_unit"],
  },
};

export async function createProduct(args: {
  product_code: string;
  name: string;
  base_unit: string;
  price?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  allergens?: string[];
  confirmed?: boolean;
}) {
  try {
    // === VALIDATION PHASE ===

    const codeErr = validateProductCode(args.product_code);
    if (codeErr) return { error: codeErr };

    const unitErr = validateBaseUnit(args.base_unit);
    if (unitErr) return { error: unitErr };

    const nutritionErr = validateNutrition(
      {
        calories: args.calories,
        protein: args.protein,
        carbs: args.carbs,
        fat: args.fat,
      },
      args.base_unit,
    );
    if (nutritionErr) return { error: nutritionErr };

    // Exact code uniqueness
    const uniqueErr = await checkCodeUnique(args.product_code);
    if (uniqueErr) return { error: uniqueErr };

    const prefix = args.product_code.split("-")[0];

    // Map product_code prefix to DB type value
    // After migration 071: RAW→raw_ingredient, PF→semi_finished, MOD→modifier, SALE→dish
    // Fallback (pre-071): RAW→good, PF→dish, MOD→modifier, SALE→dish
    const PREFIX_TO_TYPE: Record<string, string> = {
      RAW: "raw_ingredient",
      PF: "semi_finished",
      SALE: "dish",
      MOD: "modifier",
    };
    const dbType = PREFIX_TO_TYPE[prefix];
    if (!dbType) {
      return { error: `Cannot map prefix "${prefix}" to a database type` };
    }

    if (prefix !== "SALE" && args.price) {
      return { error: `Only SALE items can have a price. ${prefix} items get their cost from purchases.` };
    }

    if (prefix !== "RAW" && (args.calories || args.protein || args.carbs || args.fat)) {
      return { error: `Only RAW items should have direct nutrition values. ${prefix} items calculate nutrition from their BOM.` };
    }

    // === PRE-CREATION CHECKS (skip if confirmed) ===

    if (!args.confirmed) {
      const warnings: string[] = [];
      let similar: { id: string; product_code: string; name: string }[] = [];
      let supplierInfo: { found: boolean; suppliers: any[] } = { found: false, suppliers: [] };

      // Fuzzy duplicate check
      similar = await findSimilarProducts(args.name, args.product_code);
      if (similar.length > 0) {
        warnings.push(
          `DUPLICATE WARNING: Found ${similar.length} similar product(s) in the database:\n` +
            similar
              .map((s) => `  - ${s.product_code} "${s.name}" (id: ${s.id})`)
              .join("\n") +
            `\nPlease verify this is not a duplicate before creating.`
        );
      }

      // Supplier availability check (only for RAW)
      if (prefix === "RAW") {
        supplierInfo = await checkSupplierAvailability(args.name);
        if (!supplierInfo.found) {
          warnings.push(
            `SUPPLIER WARNING: "${args.name}" was not found in any supplier catalog. ` +
              `You may need to find a supplier before purchasing this ingredient.`
          );
        } else {
          // Informational — not a warning, just helpful context
          warnings.push(
            `SUPPLIER INFO: Found at ${supplierInfo.suppliers.length} supplier(s):\n` +
              supplierInfo.suppliers
                .map(
                  (s) =>
                    `  - ${s.supplier_name} (SKU: ${s.sku}, last price: ${s.price} ${s.unit})`
                )
                .join("\n")
          );
        }
      }

      // If there are any warnings, return them and ask for confirmation
      if (warnings.length > 0) {
        return {
          status: "confirmation_required",
          message:
            "Please review the following before creating this product. " +
            "Call create_product again with confirmed=true to proceed.",
          plan: {
            action: "CREATE PRODUCT",
            product_code: args.product_code,
            name: args.name,
            type: prefix,
            base_unit: args.base_unit,
            price: args.price || null,
            nutrition: args.calories
              ? {
                  calories: args.calories,
                  protein: args.protein,
                  carbs: args.carbs,
                  fat: args.fat,
                }
              : "not provided",
          },
          warnings,
          similar_products: similar.length > 0 ? similar : undefined,
          supplier_info:
            prefix === "RAW" ? supplierInfo : undefined,
        };
      }
    }

    // === CREATION PHASE ===

    const sb = getSupabase();
    const { data, error } = await sb
      .from("nomenclature")
      .insert({
        product_code: args.product_code,
        name: args.name,
        type: dbType,
        base_unit: args.base_unit,
        price: args.price || null,
        calories: args.calories || null,
        protein: args.protein || null,
        carbs: args.carbs || null,
        fat: args.fat || null,
        allergens: args.allergens || null,
        is_available: true,
      })
      .select()
      .single();

    if (error) return { error: `DB error: ${error.message}` };

    return {
      success: true,
      product: {
        id: data.id,
        code: data.product_code,
        name: data.name,
        type: data.type,
        unit: data.base_unit,
        price: data.price,
      },
      next_steps:
        prefix === "RAW"
          ? "Add nutrition data if not provided. Product will get cost_per_unit automatically when purchases are recorded."
          : `Add ingredients using add_bom_line tool. ${prefix} items calculate cost and nutrition from their BOM.`,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
