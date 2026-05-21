import { describe, it, expect } from "vitest";

describe("searchMakroCatalog", () => {
  it("returns results array shape", async () => {
    const { searchMakroCatalog } = await import("./search-makro-catalog.js");
    const result = await searchMakroCatalog({ query: "mozzarella", check_stock: false });
    expect(result).toHaveProperty("results");
    if ("results" in result) {
      expect(Array.isArray(result.results)).toBe(true);
    }
  });

  it("rejects empty query", async () => {
    const { searchMakroCatalog } = await import("./search-makro-catalog.js");
    const result = await searchMakroCatalog({ query: "  " });
    expect(result).toHaveProperty("error");
  });

  it("product shape has required fields", async () => {
    const { searchMakroCatalog } = await import("./search-makro-catalog.js");
    const result = await searchMakroCatalog({ query: "butter", check_stock: false });
    if ("results" in result && (result as any).results.length > 0) {
      const first = (result as any).results[0];
      expect(first).toHaveProperty("title_en");
      expect(first).toHaveProperty("price_thb");
      expect(first).toHaveProperty("barcode");
    }
  });
});
