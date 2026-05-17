import { describe, it, expect } from "vitest";

describe("listSuppliers", () => {
  it("returns results array shape", async () => {
    const { listSuppliers } = await import("./list-suppliers.js");
    const result = await listSuppliers({ query: "Sangdamrong" });
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("respects limit parameter", async () => {
    const { listSuppliers } = await import("./list-suppliers.js");
    const result = await listSuppliers({ limit: 1 });
    expect((result as any).results?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
