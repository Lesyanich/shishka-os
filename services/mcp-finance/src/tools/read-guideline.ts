/**
 * read-guideline — Load receipt processing guidelines on demand
 *
 * Reads markdown guidelines or JSON payload examples from
 * 02_Finance/_config/guidelines/ and 02_Finance/_config/examples/.
 *
 * This enables the Stateless Agent v2 architecture:
 * instead of loading a 550-line monolithic prompt, the agent
 * loads only the ~120-line core router and fetches specific
 * guidelines per supplier type (e.g., "makro", "market-small").
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Derive project root from compiled JS location:
// dist/tools/read-guideline.js → ../../ = mcp-finance-agent/ → ../../ = Shishka healthy kitchen/
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");
const GUIDELINES_DIR = join(PROJECT_ROOT, "02_Finance", "_config", "guidelines");
const EXAMPLES_DIR = join(PROJECT_ROOT, "02_Finance", "_config", "examples");

const GUIDELINE_IDS = new Set([
  "image-reading-protocol",
  "makro",
  "market-small",
  "delivery",
  "tax-invoice",
  "capex",
  "classification",
  "arithmetic-check",
]);

const EXAMPLE_IDS = new Set(["payload-cogs", "payload-capex"]);

export interface ReadGuidelineArgs {
  guideline_id: string;
}

export async function readGuideline(args: ReadGuidelineArgs) {
  const { guideline_id } = args;

  let filePath: string;

  if (EXAMPLE_IDS.has(guideline_id)) {
    filePath = join(EXAMPLES_DIR, `${guideline_id}.json`);
  } else if (GUIDELINE_IDS.has(guideline_id)) {
    filePath = join(GUIDELINES_DIR, `${guideline_id}.md`);
  } else {
    return {
      ok: false,
      error: `Unknown guideline_id: "${guideline_id}". Valid: ${[...GUIDELINE_IDS, ...EXAMPLE_IDS].join(", ")}`,
    };
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return {
      ok: true,
      guideline_id,
      content,
    };
  } catch (err: any) {
    return {
      ok: false,
      guideline_id,
      error: `Cannot read guideline file: ${err.message}`,
      path_hint: filePath,
    };
  }
}
