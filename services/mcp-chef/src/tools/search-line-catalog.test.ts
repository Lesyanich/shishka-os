import { describe, it, expect } from "vitest";

describe("searchLineCatalog", () => {
  it("rejects empty handle", async () => {
    const { searchLineCatalog } = await import("./search-line-catalog.js");
    const result = await searchLineCatalog({ handle: "  " });
    expect(result).toHaveProperty("error");
  });

  it("returns a catalog shape for a known shop", async () => {
    const { searchLineCatalog } = await import("./search-line-catalog.js");
    const result: any = await searchLineCatalog({
      handle: "@biovittofficial",
      shop_id: 402242,
      limit: 5,
    });
    // Live call: tolerate network failure, but if it succeeds the shape must hold.
    if ("results" in result) {
      expect(Array.isArray(result.results)).toBe(true);
      expect(result).toHaveProperty("shop_handle");
      if (result.results.length > 0) {
        const first = result.results[0];
        expect(first).toHaveProperty("name");
        expect(first).toHaveProperty("price_thb");
        expect(first).toHaveProperty("product_url");
      }
    } else {
      expect(result).toHaveProperty("error");
    }
  });

  it("normalizes a full shop URL to a handle", async () => {
    const { searchLineCatalog } = await import("./search-line-catalog.js");
    const result: any = await searchLineCatalog({
      handle: "https://shop.line.me/@biovittofficial",
      shop_id: 402242,
      limit: 1,
    });
    if ("shop_handle" in result) {
      expect(result.shop_handle).toBe("@biovittofficial");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});
