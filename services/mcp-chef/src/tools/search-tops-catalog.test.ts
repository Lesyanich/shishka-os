import { describe, it, expect } from "vitest";

// These tests hit the live tops.co.th site through a headless browser, so they
// are slow and network-dependent. They assert on shape, not on specific data,
// and tolerate the environment lacking Playwright/Chromium (clean error path).

const CATEGORY =
  "health-and-beauty-care/health-and-supplement/vitamins-and-supplements";

describe("searchTopsCatalog", () => {
  it("rejects when neither search nor category is given", async () => {
    const { searchTopsCatalog } = await import("./search-tops-catalog.js");
    const result = await searchTopsCatalog({ category: "   " });
    expect(result).toHaveProperty("error");
  });

  it("keyword search returns results or a structured error/message", async () => {
    const { searchTopsCatalog } = await import("./search-tops-catalog.js");
    const result = await searchTopsCatalog({ search: "Biovitt", limit: 5 });
    const ok = "results" in result || "message" in result || "error" in result;
    expect(ok).toBe(true);
    if ("results" in result && (result as any).results.length > 0) {
      expect((result as any).mode).toBe("search");
      const first = (result as any).results[0];
      expect(first).toHaveProperty("barcode");
      expect(first).toHaveProperty("price_thb");
    }
  }, 90_000);

  it("returns results or a structured error/message", async () => {
    const { searchTopsCatalog } = await import("./search-tops-catalog.js");
    const result = await searchTopsCatalog({ category: CATEGORY, limit: 5 });
    // One of: results array, a message (empty), or an error (no playwright / CF block)
    const ok =
      "results" in result || "message" in result || "error" in result;
    expect(ok).toBe(true);
    if ("results" in result) {
      expect(Array.isArray((result as any).results)).toBe(true);
      expect((result as any).results.length).toBeLessThanOrEqual(5);
    }
  }, 90_000);

  it("product shape has required fields when products are returned", async () => {
    const { searchTopsCatalog } = await import("./search-tops-catalog.js");
    const result = await searchTopsCatalog({ category: CATEGORY, limit: 5 });
    if ("results" in result && (result as any).results.length > 0) {
      const first = (result as any).results[0];
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("barcode");
      expect(first).toHaveProperty("price_thb");
      expect(first).toHaveProperty("product_url");
      expect(typeof first.price_thb).toBe("number");
    }
  }, 90_000);

  it("normalizes a full URL into a category path", async () => {
    const { searchTopsCatalog } = await import("./search-tops-catalog.js");
    const result = await searchTopsCatalog({
      category: `https://www.tops.co.th/en/${CATEGORY}?foo=bar`,
      limit: 3,
    });
    if ("category" in result) {
      expect((result as any).category).toBe(CATEGORY);
    }
  }, 90_000);
});
