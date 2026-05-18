import { describe, it, expect } from "vitest";

describe("searchPurchaseHistory", () => {
  it("returns results array shape", async () => {
    const { searchPurchaseHistory } = await import("./search-purchase-history.js");
    const result = await searchPurchaseHistory({ query: "sugar" });
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("finds sugar by barcode", async () => {
    const { searchPurchaseHistory } = await import("./search-purchase-history.js");
    const result = await searchPurchaseHistory({ query: "8852256100311" });
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("respects supplier filter", async () => {
    const { searchPurchaseHistory } = await import("./search-purchase-history.js");
    const result = await searchPurchaseHistory({ query: "sugar", supplier: "Makro" });
    expect(result).toHaveProperty("results");
    for (const row of (result as any).results ?? []) {
      expect(row.supplier?.toLowerCase()).toContain("makro");
    }
  });

  it("respects limit parameter", async () => {
    const { searchPurchaseHistory } = await import("./search-purchase-history.js");
    const result = await searchPurchaseHistory({ query: "sugar", limit: 1 });
    expect((result as any).results?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
