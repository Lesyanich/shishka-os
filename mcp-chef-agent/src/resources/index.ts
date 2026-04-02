/**
 * MCP Resources — static reference data the agent always has access to.
 * These are exposed as resource:// URIs in the MCP protocol.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve chef-preferences.md relative to project root
function loadPreferences(): string {
  try {
    // Go from src/resources/ or dist/resources/ up to project root
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const prefPath = join(__dirname, "..", "..", "chef-preferences.md");
    return readFileSync(prefPath, "utf-8");
  } catch {
    return "# Chef Preferences\nNo preferences file found. Create chef-preferences.md in the project root.";
  }
}

export const staticResources = [
  {
    uri: "resource://shishka/nomenclature-types",
    name: "Nomenclature Types (Lego Architecture)",
    description: "Product type hierarchy and rules",
    mimeType: "text/plain",
    text: `# Shishka Nomenclature Types — Lego Architecture

## Product Types (PREFIX)
- RAW  — Raw ingredients (purchased from suppliers)
- PF   — Pre-finished / semi-finished products (made from RAW or other PF)
- MOD  — Modifiers / toppings (add-ons for dishes, made from RAW)
- SALE — Finished dishes (sold to customers, made from PF and MOD)

## Lego Chain Rules (IMMUTABLE)
SALE can contain: PF, MOD
PF can contain:   RAW, PF
MOD can contain:  RAW
RAW can contain:  nothing (leaf node)

## Product Code Format
PREFIX-NAME_PARTS
- PREFIX: one of RAW, PF, MOD, SALE
- NAME: ALL_CAPS_WITH_UNDERSCORES
- Examples: RAW-FRESH_CARROT, PF-CARROT_PUREE, SALE-CARROT_SOUP

## Base Units
Valid units: kg, g, L, ml, pcs

## Cost Rules
- RAW: cost_per_unit is set by DB trigger fn_update_cost_on_purchase (WAC method)
- PF/MOD/SALE: cost is calculated by walking the BOM tree
- NEVER manually set cost_per_unit — it's always computed

## Price Rules
- Only SALE items have a selling price
- Margin = (price - cost) / price × 100
- Target margin: ≥60% for healthy business

## Production Flow (recipes_flow)
After creating a PF or SALE product with BOM, ALWAYS add production flow steps using manage_recipe_flow.
Each step defines: operation_name, duration_min, equipment_id, instruction_text.
Steps are used by backward scheduling and KDS Gantt for kitchen planning.
Without recipes_flow, the product cannot be scheduled for production.
Use list_equipment to find equipment UUIDs.
`,
  },
  {
    uri: "resource://shishka/bom-rules",
    name: "BOM Structure Rules",
    description: "Bill of Materials rules and constraints",
    mimeType: "text/plain",
    text: `# BOM (Bill of Materials) Rules

## Structure
- bom_structures table links parent_id → ingredient_id with quantity_per_unit and yield_loss_pct
- Recursive: PF can contain other PFs (multi-level recipes)
- Circular references are forbidden and validated

## Fields (DB columns)
- parent_id: UUID of the product being made
- ingredient_id: UUID of the ingredient used
- quantity_per_unit: amount in ingredient's base_unit per 1 unit of parent
- yield_loss_pct: percentage of LOSS (0-99, null = no loss)
  - Example: yield_loss_pct=15 means 15% waste (peeling, trimming), 85% usable
  - Effective multiplier = 1 / (1 - yield_loss_pct / 100)
- notes: free text

## MCP API
- The add_bom_line tool accepts yield_pct (output %, e.g., 85 = 85% usable)
- Internally converts: yield_loss_pct = 100 - yield_pct

## Cost Calculation
cost = sum of (ingredient.cost_per_unit × quantity_per_unit × loss_multiplier) for all children
loss_multiplier = 1 / (1 - yield_loss_pct / 100)

## Nutrition Calculation (KBZHU Cascade)
For each leaf ingredient:
  contribution = ingredient_nutrition_per_base_unit × quantity_per_unit
NOTE: yield_loss_pct does NOT apply to nutrition (unlike cost).
Nutrients (protein, fat, carbs) stay in the product — only water/waste is lost.
Total nutrition = sum of all leaf contributions

## Allergen Cascade
Allergens propagate upward: if any ingredient has an allergen, the parent inherits it.
`,
  },
  {
    uri: "resource://shishka/nutrition-reference",
    name: "Nutrition & KBZHU Reference",
    description: "Nutrition tracking rules and reference values",
    mimeType: "text/plain",
    text: `# Nutrition Reference (KBZHU)

## What is KBZHU?
Russian nutritional abbreviation:
K = Калории (Calories, kcal)
B = Белки (Protein, g)
Zh = Жиры (Fat, g)
U = Углеводы (Carbs, g)

## Data Entry Rules — CRITICAL
- Nutrition values are per 1 base_unit of the product (per 1 kg, per 1 L, per 1 pcs)
- WARNING: Standard food databases give values per 100g. You MUST convert:
  - For kg items: multiply per-100g values by 10 (e.g., chicken breast = 1650 kcal/kg, NOT 165)
  - For L items: multiply per-100ml values by 10 (e.g., olive oil = 8840 kcal/L, NOT 884)
  - For g/ml items: use per-1g/1ml values directly
- Only RAW items should have direct nutrition values
- PF/MOD/SALE items calculate nutrition from their BOM tree
- Values cannot be negative

## Allergen Tracking
Common allergens tracked: gluten, dairy, nuts, soy, eggs, shellfish, fish, sesame, celery, mustard, lupin, mollusks
Allergens are stored as a JSON array on RAW items and cascade upward through BOM.

## Healthy Kitchen Focus
Shishka is a HEALTHY kitchen. When suggesting dishes or modifications:
- Prioritize whole, unprocessed ingredients
- Balance macronutrients (protein, healthy fats, complex carbs)
- Flag high-calorie or high-sugar components
- Suggest alternatives for common allergens
`,
  },
];

// Dynamic resource — reads file at request time, no rebuild needed
export const dynamicResources = [
  {
    uri: "resource://shishka/chef-preferences",
    name: "Chef Preferences & Rules",
    description:
      "Lesia's rules and preferences for the chef agent. READ THIS BEFORE ANY ACTION.",
    mimeType: "text/plain",
    load: loadPreferences,
  },
];
