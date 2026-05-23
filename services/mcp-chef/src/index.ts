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
import { updateEquipment } from "./tools/update-equipment.js";
import { checkInventory } from "./tools/check-inventory.js";
import { createProduct } from "./tools/create-product.js";
import { addBomLine } from "./tools/add-bom-line.js";
import { removeBomLine } from "./tools/remove-bom-line.js";
import { manageRecipeFlow } from "./tools/manage-recipe-flow.js";
import { updateProduct } from "./tools/update-product.js";
import { recordProduction } from "./tools/record-production.js";
import { listSuppliers } from "./tools/list-suppliers.js";
import { searchPurchaseHistory } from "./tools/search-purchase-history.js";
import { makroShoppingList } from "./tools/makro-shopping-list.js";
// Scrapers are loaded lazily — a missing/broken scraper file must NOT crash the entire chef MCP.
// See lazyScraper() helper below.

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

// Lazy loader for scraper tools — keeps a missing/broken scraper module
// from killing the entire MCP server at startup. Tool descriptions still
// register, but the underlying module only loads when the tool is invoked.
function lazyScraper<A>(modulePath: string, exportName: string) {
  return async (args: A) => {
    try {
      const mod = await import(modulePath) as Record<string, (a: A) => Promise<unknown>>;
      const fn = mod[exportName];
      if (typeof fn !== "function") {
        return jsonResult({ error: `Scraper export '${exportName}' missing in ${modulePath}` });
      }
      return jsonResult(await fn(args));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === "ERR_MODULE_NOT_FOUND") {
        return jsonResult({ error: `Scraper module not available: ${modulePath}. Install or remove this tool.` });
      }
      return jsonResult({ error: `Scraper failed: ${e.message ?? String(err)}` });
    }
  };
}

// ─── Read-only Tools ─────────────────────────────────────────────

server.tool(
  "search_products",
  "Search the product catalog (nomenclature). Returns matching items with nutrition, cost, and availability. Can browse by category (e.g. category='F-PRD-MSH' for mushrooms).",
  {
    query: z.string().optional().describe("Search term (matches product_code, name, or aliases)"),
    type: z.enum(["RAW", "PF", "MOD", "SALE"]).optional().describe("Filter by product type"),
    category: z.string().optional().describe("Filter by category code (L3 exact, L2/L1 prefix). E.g. 'F-PRD-MSH', 'F-PRO', 'NF'"),
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
  "List kitchen equipment with availability and category. Supports multilingual search by name/alias.",
  {
    category: z.string().optional().describe("Filter by equipment category"),
    name_search: z.string().optional().describe(
      "Search equipment by name or alias in any language (e.g., 'salad bar', 'салат-бар', 'vacuum'). Matches name, equipment_code, and aliases."
    ),
    available_only: z.boolean().optional().describe("Only show available equipment"),
  },
  async (args) => jsonResult(await listEquipment(args))
);

server.tool(
  "update_equipment",
  "Update equipment specs: capacity, timing, notes, category, status. Use after list_equipment to enrich empty cards.",
  {
    equipment_id: z.string().describe("UUID of equipment to update"),
    name: z.string().optional().describe("Rename the equipment"),
    category: z.string().optional().describe("Category: oven, refrigeration, cooking, prep, beverage, fermentation, storage, service, infrastructure"),
    status: z.string().optional().describe("Status: available, active, maintenance, out_of_service, retired"),
    is_available: z.boolean().optional().describe("Availability flag"),
    capacity: z.number().optional().describe("Max load per cycle (e.g., 5 for 5kg capacity)"),
    capacity_unit: z.string().optional().describe("Unit for capacity (e.g., kg, liters, pcs, trays)"),
    processing_time_min: z.number().optional().describe("Standard cycle time in minutes"),
    setup_time_min: z.number().optional().describe("Cleanup/setup time between uses in minutes"),
    max_parallel: z.number().optional().describe("Parallel batches supported (e.g., oven trays)"),
    notes: z.string().optional().describe("Free-text notes about the equipment"),
  },
  async (args) => jsonResult(await updateEquipment(args))
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

server.tool(
  "list_suppliers",
  "List suppliers from the suppliers table. Use to find supplier names, IDs, and how many products are linked. Bridges Finance→Chef visibility gap.",
  {
    query: z.string().optional().describe("Search by supplier name (e.g., 'Sangdamrong', 'Makro')"),
    category_code: z.number().optional().describe("Filter by financial category code"),
    limit: z.number().optional().describe("Max results (default: 30)"),
  },
  async (args) => jsonResult(await listSuppliers(args))
);

server.tool(
  "search_purchase_history",
  "Search purchase history: dates, prices, barcodes, suppliers. Queries purchase_logs joined with nomenclature, suppliers, and supplier_catalog. Use to find what was bought, when, at what price, and from whom.",
  {
    query: z.string().describe("Search term (matches product name, product_code, barcode, or supplier catalog name in any language)"),
    supplier: z.string().optional().describe("Filter by supplier name (e.g., 'Makro')"),
    date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
    date_to: z.string().optional().describe("End date YYYY-MM-DD"),
    limit: z.number().optional().describe("Max results (default: 50)"),
  },
  async (args) => jsonResult(await searchPurchaseHistory(args))
);

server.tool(
  "search_sangdamrong_catalog",
  "Search Sangdamrong catalog — kitchenware, packaging, supplies, glassware, trays, electrical appliances. ~100 featured products across 18 categories. Use for kitchen equipment and packaging sourcing.",
  {
    query: z.string().optional().describe("Search term (Thai or English, e.g., 'knife', 'tray', 'glass')"),
    category: z.string().optional().describe("Filter by category name (Thai, e.g., 'เครื่องครัว' for kitchenware)"),
  },
  lazyScraper("./tools/search-sangdamrong-catalog.js", "searchSangdamrongCatalog")
);

server.tool(
  "search_homepro_catalog",
  "Search HomePro product catalog — home improvement, security cameras, kitchen equipment, tools, appliances. Full search with Thai+English names, prices, brands. Use for equipment, hardware, and security sourcing.",
  {
    query: z.string().describe("Search term (Thai or English, e.g., 'security camera', 'กล้องวงจรปิด', 'kitchen faucet')"),
    limit: z.number().optional().describe("Max results (default: 20)"),
  },
  lazyScraper("./tools/search-homepro-catalog.js", "searchHomeProCatalog")
);

server.tool(
  "search_makro_catalog",
  "Search Makro Pro product catalog — real prices, barcodes, brands, and ST166 Rawai stock. Use INSTEAD of WebSearch when looking for ingredients/products available at Makro.",
  {
    query: z.string().describe("Search term (Thai or English, e.g., 'chicken breast', 'น้ำตาล', 'mozzarella')"),
    check_stock: z.boolean().optional().describe("Check ST166 Rawai inventory levels (default: true)"),
    store_code: z.string().optional().describe("Makro store code (default: 166 = Rawai Phuket)"),
  },
  lazyScraper("./tools/search-makro-catalog.js", "searchMakroCatalog")
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
    category_id: z.string().optional().describe("UUID of product_categories row. REQUIRED for SALE items (dish is invisible on menu without it). Optional for RAW/PF/MOD — DB trigger auto-assigns from keyword match on name."),
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
// NOTE: Mission Control tools (emit_business_task, list_tasks, get_task, update_task)
// have been extracted to services/mcp-mission-control/

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

server.tool(
  "record_production",
  "Log daily kitchen production (baked, frozen, fermented items + quantities). Fuzzy-matches product codes to nomenclature. Unmatched items are returned for human review.",
  {
    items: z.array(z.object({
      product_code: z.string().describe("Product code (e.g., PF-MANAKISH_DOUGH) or search term"),
      quantity: z.number().describe("Amount produced (must be > 0)"),
      unit: z.string().optional().describe("Unit (g, kg, pcs, ml, L). Defaults to product's base_unit"),
      storage: z.enum(["fridge", "freezer", "fermented", "ambient"]).optional().describe("Storage method after production (default: fridge)"),
      notes: z.string().optional().describe("Batch notes: yield observations, quality remarks"),
    })).describe("Array of produced items to log"),
    production_date: z.string().optional().describe("Date of production YYYY-MM-DD (default: today)"),
  },
  async (args) => jsonResult(await recordProduction(args))
);

server.tool(
  "makro_shopping_list",
  "Generate Makro shopping list for all active SALE menu dishes. Returns RAW ingredients sourced from Makro with product links, prices, and package info. No parameters needed.",
  {},
  async () => jsonResult(await makroShoppingList())
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
  console.error(`   Tools: 20 | Resources: 3 | Prompts: 4`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
