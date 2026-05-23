import { describe, it, expect } from "vitest";

describe("storeMemory", () => {
  it("stores a memory and returns id", async () => {
    const { storeMemory } = await import("./store-memory.js");
    const result = await storeMemory({
      agent_id: "chef",
      memory_type: "idea",
      title: "Test memory — vitest",
      content: "This is a test memory created by vitest. Safe to delete.",
      tags: ["test", "vitest"],
      source: "agent",
      created_by: "vitest",
    });
    expect(result.ok).toBe(true);
    expect(result.memory).toHaveProperty("id");
    expect(result.memory?.title).toBe("Test memory — vitest");
  });

  it("rejects invalid memory_type", async () => {
    const { storeMemory } = await import("./store-memory.js");
    const result = await storeMemory({
      agent_id: "chef",
      memory_type: "invalid_type",
      title: "Should fail",
      content: "bad type",
      created_by: "vitest",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
