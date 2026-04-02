/**
 * MCP Prompts — pre-built prompt templates for common chef agent workflows.
 */

export const prompts = [
  {
    name: "create-dish",
    description:
      "Step-by-step workflow to create a new dish in the system with all its BOM layers",
    arguments: [
      {
        name: "dish_name",
        description: "Name of the dish to create (e.g., 'Green Smoothie Bowl')",
        required: true,
      },
      {
        name: "target_price",
        description: "Target selling price in THB (optional)",
        required: false,
      },
    ],
    getMessages: (args: Record<string, string>) => [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Create a new dish: "${args.dish_name}"${args.target_price ? ` with target price ${args.target_price} THB` : ""}.

CRITICAL RULES — read resource://shishka/chef-preferences FIRST.
- NEVER create anything without showing the full plan and getting user confirmation
- ALL database entries must be in English
- Check for duplicates before creating anything

Follow this workflow:

PHASE 1 — RESEARCH (no writes):
1. search_products to check if a similar dish already exists (SALE type)
2. Identify all needed ingredients — search for each RAW ingredient
3. For each missing ingredient, note it but DO NOT create yet
4. Check if any semi-finished components (PF) exist

PHASE 2 — PLAN (show to user, wait for approval):
Present a complete plan showing:
- What new products will be created (with product_codes)
- What BOM lines will be added (with quantities)
- Any warnings from duplicate/supplier checks
- Ask: "Here is my plan. Should I proceed?"

PHASE 3 — EXECUTE (only after user says yes):
5. Create missing RAW items with create_product (include nutrition)
6. Create missing PF items and their BOMs
7. Create the SALE item
8. Add all BOM lines with add_bom_line (remember yield_pct for waste)

PHASE 4 — VERIFY:
9. validate_bom to check the recipe
10. calculate_cost to see total cost
11. suggest_price to recommend selling price${args.target_price ? ` (compare with target ${args.target_price} THB)` : ""}
12. calculate_nutrition to get KBZHU values

Remember:
- Lego rules: SALE → PF/MOD, PF → RAW/PF, MOD → RAW
- Shishka is a HEALTHY kitchen — prioritize nutritious ingredients
- All quantities are in the ingredient's base_unit
- Set yield_pct < 100 for ingredients with waste (e.g., 85 for 15% peeling loss)
- If create_product returns confirmation_required, show warnings to user first`,
        },
      },
    ],
  },
  {
    name: "audit-menu",
    description:
      "Full audit of all dishes: cost, margin, nutrition completeness, and issues",
    arguments: [
      {
        name: "min_margin",
        description: "Minimum acceptable margin percentage (default: 60)",
        required: false,
      },
    ],
    getMessages: (args: Record<string, string>) => [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Run a complete menu audit.

1. Use audit_all_dishes with min_margin_pct=${args.min_margin || "60"}
2. For each dish with issues, run validate_bom for detailed diagnostics
3. For dishes with low margins, run suggest_price to find optimal pricing
4. Summarize findings in a table:
   - Dish | Cost | Price | Margin | Nutrition | Issues
5. Provide actionable recommendations:
   - Which dishes need price adjustments?
   - Which dishes have incomplete recipes?
   - Which dishes are missing nutrition data?
   - Overall menu health score`,
        },
      },
    ],
  },
  {
    name: "daily-prep",
    description:
      "Check what needs to be prepared today based on inventory and menu",
    arguments: [],
    getMessages: () => [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Check daily prep requirements:

1. Use check_inventory with low_stock_only=true to find items below minimum
2. For each low-stock PF item, use get_bom_tree to see what RAW ingredients are needed
3. Check if those RAW ingredients are in stock with check_inventory
4. List equipment needed using list_equipment
5. Provide a prioritized prep list:
   - What PF items need to be prepared
   - RAW ingredients needed for each
   - Equipment required
   - Items that need to be ordered (RAW items also low)`,
        },
      },
    ],
  },
  {
    name: "production-review",
    description:
      "Review production efficiency, costs, and identify optimization opportunities",
    arguments: [
      {
        name: "product_code",
        description: "Specific product to review (optional, reviews all SALE if empty)",
        required: false,
      },
    ],
    getMessages: (args: Record<string, string>) => [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Production review${args.product_code ? ` for ${args.product_code}` : " for entire menu"}.

${
  args.product_code
    ? `1. Search for "${args.product_code}" to get its ID
2. Get its full BOM tree with get_bom_tree
3. Calculate cost breakdown with calculate_cost
4. Check nutrition with calculate_nutrition
5. Validate the BOM with validate_bom
6. Suggest optimal price with suggest_price`
    : `1. Run audit_all_dishes to get overview
2. For the top 3 highest-cost dishes, run calculate_cost for detailed breakdown
3. Identify the most expensive ingredients across all dishes
4. Look for opportunities:
   - Ingredients used in multiple dishes (consolidation)
   - High-cost items that could be substituted
   - Dishes with very low margins
   - Missing data that affects calculations`
}

Provide specific, actionable recommendations for cost optimization while maintaining Shishka's healthy kitchen standards.`,
        },
      },
    ],
  },
];
