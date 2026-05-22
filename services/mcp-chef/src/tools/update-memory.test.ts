import { describe, it, expect } from "vitest";

describe("updateMemory", () => {
  it("rejects empty patch", async () => {
    const { updateMemory } = await import("./update-memory.js");
    const result = await updateMemory({ id: "00000000-0000-0000-0000-000000000000" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Nothing to update");
  });

  it("returns error for non-existent id", async () => {
    const { updateMemory } = await import("./update-memory.js");
    const result = await updateMemory({
      id: "00000000-0000-0000-0000-000000000000",
      content: "updated content",
    });
    // single() on zero rows returns an error
    expect(result.ok).toBe(false);
  });
});
