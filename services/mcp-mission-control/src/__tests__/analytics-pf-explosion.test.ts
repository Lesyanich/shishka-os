/*
  S1 acceptance test — spec-stock-control-analytics.md section 3.6 / MC 1be5f592.

  "Unit test: a known manakish sale explodes to the expected flour/za'atar grams."

  What this guards. Sale deductions stop at the PF tier, so RAW usage inside a PF
  is derived by walking bom_structures (depth <= 3, yield_loss_pct applied at every
  level) inside v_analytics_usage_weekly. If someone edits that recipe, changes a
  yield loss, or rewrites the view's recursion, the grams behind every variance
  number move silently. This test pins the known manakish so that stops being
  silent.

  Why it lives in mcp-mission-control. The logic under test is SQL in production,
  not a TypeScript module, and this is the only package whose CI job is wired with
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ci.yml, "MCP Mission Control"). It
  skips cleanly when those are absent, which is also how that job is configured
  (continue-on-error when the secret is empty), so a local `npm test` without a
  .env stays green.

  Read-only: SELECTs through PostgREST, no writes, no DDL.
*/

import { describe, it, expect, beforeAll } from "vitest";
import { getSupabaseOptional } from "../lib/supabase.js";

const supabase = getSupabaseOptional();

/** The PF a Za'atar manakish sale actually deducts (SALE-MANAISH_ZAATAR_GF). */
const PF_CODE = "PF-MANAISH_ZAATAR_FROZEN";

/**
 * Expected base units consumed per 1 pc of the PF, measured against prod on
 * 2026-10-16 and hand-checked against the recipe.
 *
 * RAW-OLIVE-OIL is the interesting one: it is reached by TWO paths — directly in
 * the manakish PF (0.010 L) and again inside PF-MANAISH_DOUGH_POTATO (0.0015 L).
 * The explosion must SUM paths, not pick the first one, so 0.0115 is the
 * assertion that catches a "first path wins" regression.
 */
const EXPECTED_PER_PC: Record<string, number> = {
  "RAW-ZAATAR": 0.01,
  "RAW-OLIVE-OIL": 0.0115,
  "RAW-FLOUR-RICE": 0.006,
  "RAW-POTATO": 0.036,
  "RAW-SALT-SEA": 0.00045,
  "RAW-SESAME-SEEDS-WHITE": 0.0015,
  "RAW-SESAME-SEEDS-BLACK": 0.0015,
};

type BomRow = {
  ingredient_id: string;
  quantity_per_unit: number | null;
  yield_loss_pct: number | null;
};

/** One level of bom_structures under `parentId`. */
async function childrenOf(parentId: string): Promise<BomRow[]> {
  const { data, error } = await supabase!
    .from("bom_structures")
    .select("ingredient_id, quantity_per_unit, yield_loss_pct")
    .eq("parent_id", parentId);
  if (error) throw new Error(`bom_structures(${parentId}): ${error.message}`);
  return (data ?? []) as BomRow[];
}

async function productCodes(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase!
    .from("nomenclature")
    .select("id, product_code")
    .in("id", ids);
  if (error) throw new Error(`nomenclature codes: ${error.message}`);
  return new Map((data ?? []).map((r: any) => [r.id as string, r.product_code as string]));
}

const factor = (row: BomRow) =>
  Number(row.quantity_per_unit ?? 0) * (1 + Number(row.yield_loss_pct ?? 0) / 100);

describe.skipIf(!supabase)("v_analytics_usage_weekly — PF to RAW explosion (S1 section 3.6)", () => {
  /** leaf product_code -> base units per 1 pc of the PF, summed over all paths. */
  let perPc = new Map<string, number>();
  /** How deep the walk had to go, and whether a PF node survives at depth 3. */
  let maxDepthSeen = 0;
  let pfNodesAtDepthThree = 0;

  beforeAll(async () => {
    const { data: pf, error } = await supabase!
      .from("nomenclature")
      .select("id, product_code")
      .eq("product_code", PF_CODE)
      .single();
    if (error) throw new Error(`${PF_CODE} not found: ${error.message}`);

    // Breadth-first to depth 3, the same cap the view uses. Quantities multiply
    // down a path; a leaf reached twice accumulates.
    let frontier: Array<{ id: string; qty: number }> = [{ id: pf!.id as string, qty: 1 }];

    for (let depth = 1; depth <= 3 && frontier.length > 0; depth++) {
      const rows = await Promise.all(
        frontier.map(async (node) => ({ node, kids: await childrenOf(node.id) })),
      );
      const allKidIds = rows.flatMap((r) => r.kids.map((k) => k.ingredient_id));
      const codes = await productCodes([...new Set(allKidIds)]);
      const next: Array<{ id: string; qty: number }> = [];

      for (const { node, kids } of rows) {
        for (const kid of kids) {
          const qty = node.qty * factor(kid);
          const code = codes.get(kid.ingredient_id) ?? "(unknown)";
          maxDepthSeen = Math.max(maxDepthSeen, depth);
          if (code.startsWith("PF-")) {
            if (depth === 3) pfNodesAtDepthThree++;
            next.push({ id: kid.ingredient_id, qty });
          } else {
            perPc.set(code, (perPc.get(code) ?? 0) + qty);
          }
        }
      }
      frontier = next;
    }
  });

  it("explodes to the expected base units per piece", () => {
    for (const [code, expected] of Object.entries(EXPECTED_PER_PC)) {
      expect(perPc.get(code), `${code} per 1 pc of ${PF_CODE}`).toBeCloseTo(expected, 6);
    }
  });

  it("sums a leaf reached by several paths instead of taking the first", () => {
    // 0.010 L directly in the manakish PF + 0.0015 L inside the dough PF.
    expect(perPc.get("RAW-OLIVE-OIL")).toBeCloseTo(0.0115, 6);
    expect(perPc.get("RAW-OLIVE-OIL")).toBeGreaterThan(0.01);
  });

  it("yields the expected grams for a 35 pc sale", () => {
    // 35 pcs is what SALE-MANAISH_ZAATAR_GF had deducted as of 2026-10-16; the
    // point here is the arithmetic, not the running total.
    expect((perPc.get("RAW-ZAATAR") ?? 0) * 35).toBeCloseTo(0.35, 4); // 350 g za'atar
    expect((perPc.get("RAW-FLOUR-RICE") ?? 0) * 35).toBeCloseTo(0.21, 4); // 210 g rice flour
    expect((perPc.get("RAW-POTATO") ?? 0) * 35).toBeCloseTo(1.26, 4); // 1.26 kg potato
  });

  it("needs no more than the depth-3 cap the view applies", () => {
    expect(maxDepthSeen).toBeLessThanOrEqual(3);
    // A PF still unexpanded at depth 3 would mean the cap is cutting RAW off.
    expect(pfNodesAtDepthThree).toBe(0);
  });

  it("the view reports this PF's own deductions and explodes RAW alongside", async () => {
    const { data: pfRows, error: pfErr } = await supabase!
      .from("v_analytics_usage_weekly")
      .select("week, product_code, tier, usage_direct_qty, usage_exploded_qty")
      .eq("product_code", PF_CODE);
    expect(pfErr, pfErr?.message).toBeNull();
    expect(pfRows?.length ?? 0).toBeGreaterThan(0);

    // A PF's usage is its deductions; nothing explodes INTO a PF.
    for (const r of pfRows as any[]) {
      expect(r.tier).toBe("PF");
      expect(Number(r.usage_direct_qty)).toBeGreaterThan(0);
      expect(Number(r.usage_exploded_qty)).toBe(0);
    }

    // The RAW side must carry a non-zero exploded component in those weeks.
    const weeks = (pfRows as any[]).map((r) => r.week);
    const { data: rawRows, error: rawErr } = await supabase!
      .from("v_analytics_usage_weekly")
      .select("week, product_code, tier, usage_exploded_qty")
      .eq("product_code", "RAW-ZAATAR")
      .in("week", weeks);
    expect(rawErr, rawErr?.message).toBeNull();
    expect(rawRows?.length ?? 0).toBeGreaterThan(0);
    expect(
      (rawRows as any[]).reduce((s, r) => s + Number(r.usage_exploded_qty), 0),
    ).toBeGreaterThan(0);
    for (const r of rawRows as any[]) expect(r.tier).toBe("RAW");
  });
});
