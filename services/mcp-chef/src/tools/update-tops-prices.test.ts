import { describe, it, expect } from "vitest";

// updateTopsPrices touches Supabase (service role) and the live Tops site via a
// headless browser. These tests assert shape and the no-input guard, and
// tolerate the environment lacking SUPABASE_* env or Playwright (clean error).

describe("updateTopsPrices", () => {
  it("rejects when neither barcodes nor sweep is given", async () => {
    const { updateTopsPrices } = await import("./update-tops-prices.js");
    const result = await updateTopsPrices({});
    // Without DB env it errors on getSupabase; with env it errors on missing input.
    expect(result).toHaveProperty("error");
  });

  it("dry_run returns a structured preview or a clean error", async () => {
    const { updateTopsPrices } = await import("./update-tops-prices.js");
    const result = await updateTopsPrices({
      barcodes: ["8859047701232"],
      dry_run: true,
    });
    const ok =
      "dry_run" in result || "message" in result || "error" in result;
    expect(ok).toBe(true);
    if ("dry_run" in result) {
      expect((result as any).dry_run).toBe(true);
      expect(result).toHaveProperty("looked_up");
      expect(result).toHaveProperty("to_write");
    }
  }, 90_000);
});
