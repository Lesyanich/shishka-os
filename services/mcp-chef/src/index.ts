#!/usr/bin/env node

/**
 * Shishka Chef Agent — MCP Server
 *
 * Connects Claude Desktop to Shishka OS Supabase backend.
 * Provides tools for menu management, BOM operations,
 * nutrition tracking, cost analysis, and kitchen operations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Tool handlers
import { searchProducts } from "./tools/search-products.js";
import { getBomTreeTool } from "./tools/get-bom-tree.js";
import { calculateCost } from "./tools/calculate-cost.js";
import { calculateNutrition } from "./tools/calculate-nutrition.js";
import { suggestPrice } from "./tools/suggest-price.js";
import { validateBom } from "./tools/validate-bom.js";
import { auditAllDishes } from "./tools/audit-all-dishes.js";
import { listEquipment } from "./tools/list-equipment.js";
import { checkInventory } from "./tools/check-inventory.js";
import { createProduct } from "./tools/create-product.js";
import { addBomLine } from "./tools/add-bom-line.js";
import { removeBomLine } from "./tools/remove-bom-line.js";
import { searchKnowledge } from "./tools/search-knowledge.js";
import { manageRecipeFlow } from "./tools/manage-recipe-flow.js";
import { updateProduct } from "./tools/update-product.js";

// Resources & Prompts
import { staticResources, dynamicResources } from "./resources/index.js";
import { prompts } from "./prompts/index.js";

// ─── Server Setup ────────────────────────────────────────────────

const server = new McpServer({
  name: "shishka-chef-agent",
  version: "1.0.0",
});

// ─── Helper ──────────────────────────────────────────────────────

function jsonResult(data: any) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ─── Read-only Tools ─────────────────────────────────────────────

server.tool(
  "search_products",
  "Search the product catalog (nomenclature). Returns matching items with nutrition, cost, and availability.",
  {
    query: z.string().describe("Search term (matches product_code or name)"),
    type: z.enum(["RAW", "PF", "MOD", "SALE"]).optional().describe("Filter by product type"),
    limit: z.number().optional().describe("Max results (default: 20)"),
  },
  async (args) => jsonResult(await searchProducts(args))
);

server.tool(
  "get_bom_tree",
  "Get the full BOM (recipe) tree for a product with costs and nutrition calculated recursively.",
  {
    product_id: z.string().describe("UUID of the product to inspect"),
  },
  async (args) => jsonResult(await getBomTreeTool(args))
);

server.tool(
  "calculate_cost",
  "Calculate total cost of a product by recursively walking its BOM tree. Returns cost breakdown and margin.",
  {
    product_id: z.string().describe("UUID of the product"),
  },
  async (args) => jsonResult(await calculateCost(args))
);

server.tool(
  "calculate_nutrition",
  "Calculate aggregated KBZHU (calories, protein, carbs, fat) and allergens for a product by cascading through its BOM tree.",
  {
    product_id: z.string().describe("UUID of the product"),
  },
  async (args) => jsonResult(await calculateNutrition(args))
);

server.tool(
  "suggest_price",
  "Suggest a selling price based on BOM cost and target margin. Shows multiple margin tiers.",
  {
    product_id: z.string().describe("UUID of the product"),
    target_margin_pct: z.number().optional().describe("Target margin percentage (default: 70)"),
  },
  async (args) => jsonResult(await suggestPrice(args))
);

server.tool(
  "validate_bom",
  "Validate a product's BOM for completeness, Lego chain rules, missing data, and quality issues.",
  {
    product_id: z.string().describe("UUID of the product to validate"),
  },
  async (args) => jsonResult(await validateBom(args))
);

server.tool(
  "audit_all_dishes",
  "Audit all SALE items: cost, price, margin, nutrition, issues. Menu-wide health check.",
  {
    min_margin_pct: z.number().optional().describe("Flag dishes below this margin (default: 60)"),
    only_problems: z.boolean().optional().describe("Only return dishes with issues"),
  },
  async (args) => jsonResult(await auditAllDishes(args))
);

server.tool(
  "list_equipment",
  "List kitchen equipment with availability and category.",
  {
    category: z.string().optional().describe("Filter by equipment category"),
    available_only: z.boolean().optional().describe("Only show available equipment"),
  },
  async (args) => jsonResult(await listEquipment(args))
);

server.tool(
  "check_inventory",
  "Check current inventory levels. Filter by product, show low-stock items.",
  {
    product_id: z.string().optional().describe("UUID of a specific product to check"),
    low_stock_only: z.boolean().optional().describe("Only items below minimum stock"),
    type: z.enum(["RAW", "PF"]).optional().describe("Filter by product type"),
  },
  async (args) => jsonResult(await checkInventory(args))
);

// ─── Write Tools ─────────────────────────────────────────────────

server.tool(
  "create_product",
  "Create a new product. Checks for duplicates (fuzzy name match), supplier availability for RAW items. Returns warnings requiring confirmation before creation. NEVER set cost_per_unit.",
  {
    product_code: z.string().describe("PREFIX-NAME_PARTS (e.g., RAW-FRESH_CARROT)"),
    name: z.string().describe("Human-readable product name (English only)"),
    base_unit: z.enum(["kg", "g", "L", "ml", "pcs"]).describe("Base unit of measurement"),
    price: z.number().optional().describe("Selling price in THB (only for SALE items)"),
    calories: z.number().optional().describe("Calories (kcal) per 1 base_unit — NOT per 100g! For kg: multiply standard value by 10. Example: chicken = 1650/kg"),
    protein: z.number().optional().describe("Protein (g) per 1 base_unit — NOT per 100g! For kg: multiply by 10"),
    carbs: z.number().optional().describe("Carbs (g) per 1 base_unit — NOT per 100g! For kg: multiply by 10"),
    fat: z.number().optional().describe("Fat (g) per 1 base_unit — NOT per 100g! For kg: multiply by 10"),
    allergens: z.array(z.string()).optional().describe("List of allergens (only for RAW)"),
    confirmed: z.boolean().optional().describe("Set true after user reviews warnings to force creation"),
  },
  async (args) => jsonResult(await createProduct(args))
);

server.tool(
  "update_product",
  "Update an existing product's metadata: nutrition, allergens, name, price, availability. Cannot change product_code or type. NEVER set cost_per_unit.",
  {
    product_id: z.string().describe("UUID of the product to update"),
    name: z.string().optional().describe("New human-readable name"),
    calories: z.number().optional().describe("Calories (kcal) per 1 base_unit — NOT per 100g!"),
    protein: z.number().optional().describe("Protein (g) per 1 base_unit — NOT per 100g!"),
    carbs: z.number().optional().describe("Carbs (g) per 1 base_unit — NOT per 100g!"),
    fat: z.number().optional().describe("Fat (g) per 1 base_unit — NOT per 100g!"),
    allergens: z.array(z.string()).optional().describe("Updated allergens list. Empty array to clear."),
    price: z.number().optional().describe("Selling price THB (SALE items only)"),
    is_available: z.boolean().optional().describe("Availability status"),
  },
  async (args) => jsonResult(await updateProduct(args))
);

server.tool(
  "add_bom_line",
  "Add an ingredient to a product's BOM (recipe). Validates Lego chain and circular references.",
  {
    parent_id: z.string().describe("UUID of the parent product (the recipe)"),
    ingredient_id: z.string().describe("UUID of the ingredient to add"),
    quantity: z.number().describe("Quantity in ingredient's base_unit"),
    yield_pct: z.number().optional().describe("Yield percentage 1-100 (default: 100)"),
    sort_order: z.number().optional().describe("Position in the recipe"),
  },
  async (args) => jsonResult(await addBomLine(args))
);

server.tool(
  "remove_bom_line",
  "Remove an ingredient from a product's BOM.",
  {
    bom_line_id: z.string().optional().describe("UUID of the BOM line to remove"),
    parent_id: z.string().optional().describe("UUID of the parent product"),
    ingredient_id: z.string().optional().describe("UUID of the ingredient to remove"),
  },
  async (args) => jsonResult(await removeBomLine(args))
);

// ─── Production Flow Tools ───────────────────────────────────────

server.tool(
  "manage_recipe_flow",
  "Manage production flow steps for a product. Steps define operations (marination, grilling, etc.) with equipment and duration. Used by backward scheduling and KDS Gantt.",
  {
    action: z.enum(["list", "add", "remove", "set"]).describe("Action: list, add, remove, or set (replace all steps)"),
    product_code: z.string().describe("Product code (e.g., PF-CHICKEN_GRILL_NEUTRAL)"),
    step_order: z.number().optional().describe("Step order number (1-based)"),
    operation_name: z.string().optional().describe("Operation name (e.g., Marination, Grilling)"),
    equipment_id: z.string().optional().describe("UUID of equipment. Use list_equipment to find IDs."),
    duration_min: z.number().optional().describe("Expected duration in minutes"),
    instruction_text: z.string().optional().describe("Detailed instruction for the cook"),
    notes: z.string().optional().describe("Optional notes"),
    steps: z.array(z.object({
      step_order: z.number(),
      operation_name: z.string(),
      equipment_id: z.string().optional(),
      duration_min: z.number(),
      instruction_text: z.string(),
      notes: z.string().optional(),
    })).optional().describe("Array of steps for 'set' action"),
  },
  async (args) => jsonResult(await manageRecipeFlow(args))
);

// ─── Knowledge Tools ─────────────────────────────────────────────

server.tool(
  "search_knowledge",
  "Search culinary knowledge base (193+ cookbooks). Returns ratios, techniques, hacks, pairings, chemistry. Use for menu planning and recipe development.",
  {
    query: z.string().describe("Search term — matches titles, content, tags, ingredients"),
    type: z.enum(["ratio", "technique", "hack", "chemistry", "concept", "pairing", "substitution"]).optional().describe("Filter by card type"),
    ingredient: z.string().optional().describe("Filter by ingredient name"),
    relevance: z.enum(["high", "medium", "low"]).optional().describe("Filter by Shishka relevance"),
    limit: z.number().optional().describe("Max results (default: 10)"),
  },
  async (args) => jsonResult(await searchKnowledge(args))
);

// ─── Resources ───────────────────────────────────────────────────

// Static resources (hardcoded reference data)
for (const res of staticResources) {
  server.resource(res.name, res.uri, async () => ({
    contents: [
      {
        uri: res.uri,
        mimeType: res.mimeType,
        text: res.text,
      },
    ],
  }));
}

// Dynamic resources (loaded from files at request time)
for (const res of dynamicResources) {
  server.resource(res.name, res.uri, async () => ({
    contents: [
      {
        uri: res.uri,
        mimeType: res.mimeType,
        text: res.load(),
      },
    ],
  }));
}

// ─── Prompts ─────────────────────────────────────────────────────

// create-dish
server.prompt(
  "create-dish",
  "Step-by-step workflow to create a new dish with all BOM layers",
  {
    dish_name: z.string().describe("Name of the dish to create"),
    target_price: z.string().optional().describe("Target selling price in THB"),
  },
  async (args) => ({
    messages: prompts[0].getMessages(args as Record<string, string>),
  })
);

// audit-menu
server.prompt(
  "audit-menu",
  "Full audit of all dishes: cost, margin, nutrition completeness",
  {
    min_margin: z.string().optional().describe("Minimum acceptable margin percentage (default: 60)"),
  },
  async (args) => ({
    messages: prompts[1].getMessages(args as Record<string, string>),
  })
);

// daily-prep
server.prompt(
  "daily-prep",
  "Check what needs to be prepared today based on inventory and menu",
  async () => ({
    messages: prompts[2].getMessages({}),
  })
);

// production-review
server.prompt(
  "production-review",
  "Review production efficiency, costs, and optimization opportunities",
  {
    product_code: z.string().optional().describe("Specific product to review"),
  },
  async (args) => ({
    messages: prompts[3].getMessages(args as Record<string, string>),
  })
);

// ─── Start ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Shishka Chef Agent MCP server running on stdio`);
  console.error(`   Tools: 15 | Resources: 3 | Prompts: 4`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
