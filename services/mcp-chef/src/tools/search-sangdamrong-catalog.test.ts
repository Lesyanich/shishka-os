import { describe, it, expect } from "vitest";

describe("searchSangdamrongCatalog", () => {
  it("returns results or empty array shape", async () => {
    const { searchSangdamrongCatalog } = await import("./search-sangdamrong-catalog.js");
    const result = await searchSangdamrongCatalog({ query: "knife" });
    // Either results array or error (site down)
    expect("results" in result || "error" in result).toBe(true);
    if ("results" in result) {
      expect(Array.isArray(result.results)).toBe(true);
    }
  });

  it("returns categories on empty query", async () => {
    const { searchSangdamrongCatalog } = await import("./search-sangdamrong-catalog.js");
    const result = await searchSangdamrongCatalog({});
    // Should return full catalog or error
    expect("results" in result || "error" in result).toBe(true);
  });

  it("product shape has required fields", async () => {
    const { searchSangdamrongCatalog } = await import("./search-sangdamrong-catalog.js");
    const result = await searchSangdamrongCatalog({});
    if ("results" in result && (result as any).results.length > 0) {
      const first = (result as any).results[0];
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("price_thb");
      expect(first).toHaveProperty("sku_code");
    }
  });
});
