import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client + makro-lookup BEFORE importing the tool.
// vi.hoisted lets us define mock builders that are hoisted with the vi.mock calls.
const mocks = vi.hoisted(() => {
  return {
    getSupabase: vi.fn(),
    makroLookup: vi.fn(),
  };
});

vi.mock("../lib/supabase.js", () => ({
  getSupabase: mocks.getSupabase,
}));

vi.mock("./makro-lookup.js", () => ({
  makroLookup: mocks.makroLookup,
}));

import { packInfoLookup } from "./pack-info-lookup.js";

const NID = "d411c6ec-b843-46c7-8cd4-eba0f6efe19a";

interface SbStubOptions {
  nomenclature?: { name: string; brand_name: string | null } | null;
  nomenclature_error?: { message: string } | null;
  sc_exact?: Array<Record<string, unknown>>;
  sc_fuzzy?: Array<Record<string, unknown>>;
}

function makeSbStub(opts: SbStubOptions) {
  // Tracks builder state per chained call so the right branch returns data.
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      let hasBarcodeFilter = false;

      const eq = vi.fn((_col: string, _val: unknown) => {
        if (_col === "barcode") hasBarcodeFilter = true;
        return builder;
      });
      const not = vi.fn(() => builder);
      const select = vi.fn(() => builder);
      const maybeSingle = vi.fn(async () => {
        if (table === "nomenclature") {
          if (opts.nomenclature_error) return { data: null, error: opts.nomenclature_error };
          return { data: opts.nomenclature ?? null, error: null };
        }
        return { data: null, error: null };
      });
      const then = (resolve: (v: { data: unknown; error: unknown }) => void) => {
        if (table === "supplier_catalog") {
          // Exact: filtered by barcode; Fuzzy: only by nomenclature_id.
          const rows = hasBarcodeFilter ? (opts.sc_exact ?? []) : (opts.sc_fuzzy ?? []);
          resolve({ data: rows, error: null });
        } else {
          resolve({ data: null, error: null });
        }
      };

      Object.assign(builder, { select, eq, not, maybeSingle, then });
      return builder;
    }),
  };
}

beforeEach(() => {
  mocks.getSupabase.mockReset();
  mocks.makroLookup.mockReset();
});

describe("packInfoLookup input validation", () => {
  it("rejects non-UUID nomenclature_id", async () => {
    const r = await packInfoLookup({ nomenclature_id: "not-a-uuid" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/UUID/);
    expect(mocks.getSupabase).not.toHaveBeenCalled();
  });

  it("rejects empty-string barcode", async () => {
    const r = await packInfoLookup({ nomenclature_id: NID, barcode: "" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/barcode/);
  });

  it("rejects non-finite last_price_thb", async () => {
    const r = await packInfoLookup({ nomenclature_id: NID, last_price_thb: Number.NaN });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/last_price_thb/);
  });
});

describe("packInfoLookup nomenclature lookup", () => {
  it("returns error when nomenclature row is missing", async () => {
    mocks.getSupabase.mockReturnValue(makeSbStub({ nomenclature: null }));
    const r = await packInfoLookup({ nomenclature_id: NID });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it("surfaces supabase error on nomenclature fetch", async () => {
    mocks.getSupabase.mockReturnValue(
      makeSbStub({ nomenclature_error: { message: "connection refused" } }),
    );
    const r = await packInfoLookup({ nomenclature_id: NID });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/connection refused/);
  });
});

describe("packInfoLookup cascade", () => {
  it("returns supplier_catalog_exact at conf=1.0 when barcode matches one row", async () => {
    mocks.getSupabase.mockReturnValue(
      makeSbStub({
        nomenclature: { name: "Divella Farina", brand_name: "Divella" },
        sc_exact: [
          {
            supplier_id: "sup-1",
            package_weight: "500g",
            package_qty: 500,
            package_unit: "g",
            barcode: "8005121004113",
            product_name: "Divella Farina 500g",
            brand: "Divella",
          },
        ],
      }),
    );

    const r = await packInfoLookup({
      nomenclature_id: NID,
      barcode: "8005121004113",
      last_price_thb: 133,
    });

    expect(r.ok).toBe(true);
    expect(r.result?.source).toBe("supplier_catalog_exact");
    expect(r.result?.confidence).toBe(1.0);
    expect(r.result?.resolved?.package_qty).toBe(500);
    expect(r.result?.resolved?.package_unit).toBe("g");
    expect(r.errors).toBeUndefined();
  });

  it("returns conf=0 result when entire cascade fails (no DB hit, no makro)", async () => {
    mocks.getSupabase.mockReturnValue(
      makeSbStub({
        nomenclature: { name: "Unknown Item", brand_name: null },
        sc_exact: [],
        sc_fuzzy: [],
      }),
    );
    mocks.makroLookup.mockResolvedValue({ found: false, barcode: "x", name: null, unit: null, brand: null });

    const r = await packInfoLookup({ nomenclature_id: NID, barcode: "9999" });
    expect(r.ok).toBe(true);
    expect(r.result?.confidence).toBe(0);
    expect(r.result?.resolved).toBeNull();
    expect(r.result?.source).toBeNull();
  });

  it("captures makro errors in response.errors when fetch throws", async () => {
    mocks.getSupabase.mockReturnValue(
      makeSbStub({
        nomenclature: { name: "Olive Oil", brand_name: "Bertolli" },
        sc_exact: [],
        sc_fuzzy: [],
      }),
    );
    mocks.makroLookup.mockRejectedValue(new Error("makro 503"));

    const r = await packInfoLookup({ nomenclature_id: NID, barcode: "1234567" });
    expect(r.ok).toBe(true);
    expect(r.result?.confidence).toBe(0);
    expect(r.errors).toBeDefined();
    expect(r.errors?.length).toBeGreaterThan(0);
    expect(r.errors?.[0].message).toMatch(/makro 503/);
  });
});
