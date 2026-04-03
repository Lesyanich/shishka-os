import { getSupabase } from "../lib/supabase.js";
import {
  getBomTree,
  calculateTreeCost,
  calculateTreeNutrition,
} from "../lib/bom-walker.js";
import { validateLegoChain } from "../lib/validators.js";

export const validateBomSchema = {
  name: "validate_bom",
  description:
    "Validate a product's BOM for completeness, correctness, and data quality. Checks: Lego chain rules, missing nutrition, zero-cost ingredients, circular refs, missing yields. Returns a list of issues found.",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "UUID of the product to validate",
      },
    },
    required: ["product_id"],
  },
};

interface BomIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: string;
}

export async function validateBom(args: { product_id: string }) {
  try {
    const sb = getSupabase();
    const issues: BomIssue[] = [];

    // Fetch the product
    const { data: product, error: prodErr } = await sb
      .from("nomenclature")
      .select("*")
      .eq("id", args.product_id)
      .single();

    if (prodErr || !product) return { error: "Product not found" };

    // Check: product should have a BOM if it's PF, MOD, or SALE
    const prefix = product.product_code.split("-")[0];
    const { data: bomLines } = await sb
      .from("bom_structures")
      .select("*, ingredient:nomenclature!bom_structures_ingredient_id_fkey(*)")
      .eq("parent_id", args.product_id);

    if (
      ["PF", "MOD", "SALE"].includes(prefix) &&
      (!bomLines || bomLines.length === 0)
    ) {
      issues.push({
        severity: "error",
        code: "EMPTY_BOM",
        message: `${prefix} product has no BOM lines. It needs ingredients.`,
      });
      return {
        product: product.product_code,
        name: product.name,
        issues,
        issue_count: { errors: 1, warnings: 0, info: 0 },
        valid: false,
      };
    }

    if (prefix === "RAW" && bomLines && bomLines.length > 0) {
      issues.push({
        severity: "error",
        code: "RAW_HAS_BOM",
        message: "RAW items cannot have BOM children (Lego rule).",
      });
    }

    // Walk the tree for deeper checks
    const tree = await getBomTree(args.product_id);
    if (!tree) return { error: "Failed to build BOM tree" };

    // Recursive validation
    function walkValidate(node: any, path: string) {
      for (const child of node.children) {
        const childPath = `${path} → ${child.item.product_code}`;

        // Lego chain check
        const chainErr = validateLegoChain(
          node.item.product_code,
          child.item.product_code
        );
        if (chainErr) {
          issues.push({
            severity: "error",
            code: "LEGO_VIOLATION",
            message: chainErr,
            path: childPath,
          });
        }

        // Zero quantity
        if (child.quantity <= 0) {
          issues.push({
            severity: "error",
            code: "ZERO_QUANTITY",
            message: `Quantity is ${child.quantity}`,
            path: childPath,
          });
        }

        // Yield loss check (yield_loss_pct: 0-100, percentage of LOSS)
        if (child.yield_loss_pct !== null && child.yield_loss_pct !== undefined) {
          if (child.yield_loss_pct < 0 || child.yield_loss_pct >= 100) {
            issues.push({
              severity: "warning",
              code: "BAD_YIELD_LOSS",
              message: `Yield loss is ${child.yield_loss_pct}% (should be 0-99)`,
              path: childPath,
            });
          }
        }

        // Leaf-level checks
        if (child.children.length === 0) {
          // Missing nutrition
          if (
            child.item.calories === null &&
            child.item.protein === null &&
            child.item.carbs === null &&
            child.item.fat === null
          ) {
            issues.push({
              severity: "warning",
              code: "MISSING_NUTRITION",
              message: `No KBZHU data for ${child.item.product_code}`,
              path: childPath,
            });
          }

          // Zero cost
          if (!child.item.cost_per_unit || child.item.cost_per_unit === 0) {
            issues.push({
              severity: "warning",
              code: "ZERO_COST",
              message: `No cost data for ${child.item.product_code} (no purchases?)`,
              path: childPath,
            });
          }
        }

        walkValidate(child, childPath);
      }
    }

    walkValidate(tree, product.product_code);

    // Price check for SALE items
    if (prefix === "SALE") {
      if (!product.price || product.price === 0) {
        issues.push({
          severity: "warning",
          code: "NO_PRICE",
          message: "SALE item has no selling price set.",
        });
      } else {
        const cost = calculateTreeCost(tree);
        const margin =
          product.price > 0
            ? ((product.price - cost) / product.price) * 100
            : 0;
        if (margin < 50) {
          issues.push({
            severity: "warning",
            code: "LOW_MARGIN",
            message: `Margin is only ${Math.round(margin)}%. Recommended: ≥60%.`,
          });
        }
      }
    }

    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    const info = issues.filter((i) => i.severity === "info").length;

    return {
      product: product.product_code,
      name: product.name,
      issues,
      issue_count: { errors, warnings, info },
      valid: errors === 0,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
