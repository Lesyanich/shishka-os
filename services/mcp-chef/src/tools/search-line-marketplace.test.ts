import { describe, it, expect } from "vitest";

describe("searchLineMarketplace", () => {
  it("rejects empty query", async () => {
    const { searchLineMarketplace } = await import("./search-line-marketplace.js");
    const result = await searchLineMarketplace({ query: "  " });
    expect(result).toHaveProperty("error");
  });

  it("returns a comparison shape for a query", async () => {
    const { searchLineMarketplace } = await import("./search-line-marketplace.js");
    const result: any = await searchLineMarketplace({ query: "ครีเอทีน", limit: 10 });
    // Live call: tolerate network failure, but a success must carry the contract.
    if ("results" in result && !("error" in result)) {
      expect(Array.isArray(result.results)).toBe(true);
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("shops_count");
      expect(result).toHaveProperty("e_receipt_count");
      if (result.results.length > 0) {
        const first = result.results[0];
        expect(first).toHaveProperty("name");
        expect(first).toHaveProperty("price_thb");
        expect(first).toHaveProperty("shop_name");
        expect(first).toHaveProperty("has_e_receipt");
      }
    } else {
      expect(result).toHaveProperty("error");
    }
  });

  it("computes price_per_100g when a pack size is present in the name", async () => {
    const { searchLineMarketplace } = await import("./search-line-marketplace.js");
    const result: any = await searchLineMarketplace({ query: "ครีเอทีน", limit: 40 });
    if ("results" in result && Array.isArray(result.results)) {
      const withSize = result.results.filter((r: any) => r.grams != null);
      for (const r of withSize) {
        expect(typeof r.price_per_100g).toBe("number");
      }
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});
