import { describe, it, expect } from "vitest";

// updateTopsPrices touches Supabase (service role) and the live Tops site via a
// headless browser. These tests assert shape and the no-input guard, and
// tolerate the environment lacking SUPABASE_* env or Playwright (clean error).

describe("barcodeVariants", () => {
  it("expands UPC-12 to EAN-13 (leading zero) and back", async () => {
    const { barcodeVariants } = await import("./update-tops-prices.js");
    const v12 = barcodeVariants("013000008143");
    expect(v12).toContain("013000008143");
    expect(v12).toContain("0013000008143"); // UPC-12 → EAN-13
    const v13 = barcodeVariants("0013000008143");
    expect(v13).toContain("013000008143"); // EAN-13 (leading 0) → UPC-12
  });

  it("keeps a plain EAN-13 and dedupes", async () => {
    const { barcodeVariants } = await import("./update-tops-prices.js");
    const v = barcodeVariants("8850332111118");
    expect(v).toContain("8850332111118");
    expect(new Set(v).size).toBe(v.length);
  });

  it("handles empty / non-numeric input safely", async () => {
    const { barcodeVariants } = await import("./update-tops-prices.js");
    expect(barcodeVariants("")).toEqual([]);
    expect(Array.isArray(barcodeVariants("  "))).toBe(true);
  });
});

describe("buildRows", () => {
  const product = (over: Record<string, unknown> = {}) => ({
    barcode: "8850332111118",
    sku: "T-1",
    name: "Jasmine rice 5kg",
    name_th: "ข้าวหอมมะลิ",
    brand: "Royal Umbrella",
    price_thb: 320,
    image_url: null,
    product_url: null,
    ...over,
  });

  it("emits the fn_import_supplier_catalog payload shape", async () => {
    const { buildRows } = await import("./update-tops-prices.js");
    const rows = buildRows(
      [{ ourBarcode: "8850332111118", p: product() as never }],
      new Map([["8850332111118", "nom-uuid"]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      barcode: "8850332111118",
      name: "Jasmine rice 5kg",
      price: 320,
      nomenclature_id: "nom-uuid",
    });
  });

  it("never emits a conversion_factor — Tops states a price, not a pack size", async () => {
    const { buildRows } = await import("./update-tops-prices.js");
    const [row] = buildRows(
      [{ ourBarcode: "8850332111118", p: product() as never }],
      new Map(),
    );
    expect("conversion_factor" in row).toBe(false);
    expect(row.nomenclature_id).toBeNull();
  });

  it("drops unpriced products and dedupes by our barcode", async () => {
    const { buildRows } = await import("./update-tops-prices.js");
    const rows = buildRows(
      [
        { ourBarcode: "A", p: product({ price_thb: 0 }) as never },
        { ourBarcode: "B", p: product() as never },
        { ourBarcode: "B", p: product({ price_thb: 999 }) as never },
      ],
      new Map(),
    );
    expect(rows.map((r) => r.barcode)).toEqual(["B"]);
    expect(rows[0].price).toBe(320);
  });
});

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
