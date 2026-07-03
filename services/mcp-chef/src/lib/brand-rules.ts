/**
 * Brand-compliance enforcement for the Chef Agent.
 *
 * Encodes the RED LINES from docs/bible/kitchen-philosophy.md §2 so that
 * create_product / add_bom_line cannot silently introduce a banned ingredient
 * (e.g. RAW-RICE_BRAN_OIL) — the enforcement lives in code, not just the prompt.
 *
 * Two tiers:
 *   - BANNED  → hard error. Refined/solvent-extracted (RBD) seed & grain oils,
 *               MSG, refined sugar. "Even when cheaper, even in marinades."
 *   - GATED   → confirmation_required (soft). Animal fats: allowed only in
 *               explicitly non-vegan dishes with per-case owner approval, never
 *               proposed unprompted.
 *
 * Approved fats (NOT flagged): extra virgin olive, avocado, coconut (incl.
 * deodorized coconut — the one refined exception, see kitchen-philosophy §2
 * Approved Fats Matrix).
 */

export type BrandComplianceResult =
  | { status: "ok" }
  | { status: "banned"; matched: string; reason: string }
  | { status: "gated"; matched: string; reason: string };

interface Pattern {
  /** RegExp tested against the normalized "code + name" text (lowercased, underscores→spaces). */
  re: RegExp;
  /** Human label of what matched. */
  label: string;
  /** Why it's flagged, cited to the red line. */
  reason: string;
}

/** Refined/RBD seed & grain oils + MSG + refined sugar — hard banned. */
export const BANNED_PATTERNS: Pattern[] = [
  {
    re: /\brice\s*bran\b/,
    label: "rice bran oil",
    reason:
      "Rice bran oil is an RBD (refined-bleached-deodorized) grain oil — banned per kitchen-philosophy §2, even when cheaper, even in marinades.",
  },
  {
    re: /\b(canola|rapeseed)\b/,
    label: "canola/rapeseed oil",
    reason: "Canola/rapeseed is a banned refined seed oil (kitchen-philosophy §2).",
  },
  {
    re: /\bsoy(bean)?\s*oil\b/,
    label: "soybean oil",
    reason: "Soybean oil is a banned refined seed oil (kitchen-philosophy §2).",
  },
  {
    re: /\bsunflower\s*oil\b/,
    label: "sunflower oil",
    reason: "Sunflower oil is a banned refined seed oil (kitchen-philosophy §2).",
  },
  {
    re: /\bcorn\s*oil\b/,
    label: "corn oil",
    reason: "Corn oil is a banned refined grain oil (kitchen-philosophy §2).",
  },
  {
    re: /\b(cottonseed|grapeseed|safflower)\s*oil\b/,
    label: "cottonseed/grapeseed/safflower oil",
    reason: "Refined seed oil — banned (kitchen-philosophy §2, all RBD seed/grain oils).",
  },
  {
    re: /\bvegetable\s*oil\b/,
    label: "vegetable oil",
    reason:
      'Generic "vegetable oil" is a refined seed-oil blend — banned. Specify an approved fat (EVOO, avocado, coconut).',
  },
  {
    re: /\b(msg|monosodium\s*glutamate)\b/,
    label: "MSG",
    reason: "MSG / monosodium glutamate is banned (kitchen-philosophy §2).",
  },
  {
    re: /\brefined\s*sugar\b/,
    label: "refined sugar",
    reason: "Refined sugar is banned (kitchen-philosophy §2).",
  },
];

/**
 * Animal fats — gated (soft confirmation). Never proposed unprompted; non-vegan
 * dishes only, per-case owner approval.
 *
 * NOTE on "butter": nut/plant "butters" (peanut, almond, cashew, cocoa, shea,
 * seed, apple) are NOT animal fats and must not be gated — see BUTTER_EXCLUDE.
 */
export const GATED_PATTERNS: Pattern[] = [
  {
    re: /\b(ghee|clarified\s*butter)\b/,
    label: "ghee",
    reason: "Animal fat — gated. Non-vegan dishes only, with per-case owner approval (kitchen-philosophy §2).",
  },
  {
    re: /\bduck\s*fat\b/,
    label: "duck fat",
    reason: "Animal fat — gated. Non-vegan dishes only, with per-case owner approval (kitchen-philosophy §2).",
  },
  {
    re: /\b(lard|tallow|schmaltz|beef\s*fat|pork\s*fat|chicken\s*fat)\b/,
    label: "rendered animal fat",
    reason: "Animal fat — gated. Non-vegan dishes only, with per-case owner approval (kitchen-philosophy §2).",
  },
];

/** Non-dairy "butters" that must NOT be treated as animal fat. */
const BUTTER_EXCLUDE = /\b(peanut|almond|cashew|hazelnut|macadamia|pistachio|nut|cocoa|shea|seed|sunflower|apple|coconut)\s*butter\b/;
/** Plain dairy butter — gated animal fat. */
const DAIRY_BUTTER = /\bbutter\b/;

function normalize(productCode: string, name?: string): string {
  return `${productCode ?? ""} ${name ?? ""}`
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check a product code + name against Shishka brand red lines.
 * Banned takes precedence over gated.
 */
export function checkBrandCompliance(
  productCode: string,
  name?: string,
): BrandComplianceResult {
  const text = normalize(productCode, name);
  if (!text) return { status: "ok" };

  for (const p of BANNED_PATTERNS) {
    if (p.re.test(text)) {
      return { status: "banned", matched: p.label, reason: p.reason };
    }
  }

  for (const p of GATED_PATTERNS) {
    if (p.re.test(text)) {
      return { status: "gated", matched: p.label, reason: p.reason };
    }
  }

  // Dairy butter — gate only when it's not a nut/plant butter.
  if (DAIRY_BUTTER.test(text) && !BUTTER_EXCLUDE.test(text)) {
    return {
      status: "gated",
      matched: "butter (dairy)",
      reason:
        "Dairy butter is an animal fat — gated. Non-vegan dishes only, with per-case owner approval (kitchen-philosophy §2).",
    };
  }

  return { status: "ok" };
}
