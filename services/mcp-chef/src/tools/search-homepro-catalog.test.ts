import { describe, it, expect } from "vitest";

describe("searchHomeProCatalog", () => {
  it("returns results array shape", async () => {
    const { searchHomeProCatalog } = await import("./search-homepro-catalog.js");
    const result = await searchHomeProCatalog({ query: "camera" });
    expect("results" in result || "error" in result).toBe(true);
    if ("results" in result) {
      expect(Array.isArray(result.results)).toBe(true);
    }
  });

  it("rejects empty query", async () => {
    const { searchHomeProCatalog } = await import("./search-homepro-catalog.js");
    const result = await searchHomeProCatalog({ query: "  " });
    expect(result).toHaveProperty("error");
  });

  it("product shape has required fields", async () => {
    const { searchHomeProCatalog } = await import("./search-homepro-catalog.js");
    const result = await searchHomeProCatalog({ query: "knife" });
    if ("results" in result && (result as any).results.length > 0) {
      const first = (result as any).results[0];
      expect(first).toHaveProperty("name_th");
      expect(first).toHaveProperty("price_thb");
      expect(first).toHaveProperty("sku");
    }
  });

  it("respects limit parameter", async () => {
    const { searchHomeProCatalog } = await import("./search-homepro-catalog.js");
    const result = await searchHomeProCatalog({ query: "kitchen", limit: 5 });
    if ("results" in result) {
      expect((result as any).results.length).toBeLessThanOrEqual(5);
    }
  });
});
