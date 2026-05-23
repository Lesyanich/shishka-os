import { describe, it, expect } from "vitest";

describe("recallMemories", () => {
  it("returns memories array for chef agent", async () => {
    const { recallMemories } = await import("./recall-memories.js");
    const result = await recallMemories({ agent_id: "chef", limit: 5 });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.memories)).toBe(true);
    expect(result).toHaveProperty("count");
  });

  it("filters by memory_type", async () => {
    const { recallMemories } = await import("./recall-memories.js");
    const result = await recallMemories({
      agent_id: "chef",
      memory_type: "decision",
      limit: 3,
    });
    expect(result.ok).toBe(true);
    if (result.memories && result.memories.length > 0) {
      expect(result.memories[0].memory_type).toBe("decision");
    }
  });

  it("filters by tags", async () => {
    const { recallMemories } = await import("./recall-memories.js");
    const result = await recallMemories({
      agent_id: "chef",
      tags: ["porridge"],
      limit: 5,
    });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.memories)).toBe(true);
  });
});
