import { describe, it, expect } from "vitest";

describe("makroShoppingList", () => {
  it("returns expected result shape", async () => {
    const { makroShoppingList } = await import("./makro-shopping-list.js");
    const result = await makroShoppingList();
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total_items");
    expect(result).toHaveProperty("note");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("items have required fields when non-empty", async () => {
    const { makroShoppingList } = await import("./makro-shopping-list.js");
    const result = await makroShoppingList();
    for (const item of result.items) {
      expect(item).toHaveProperty("ingredient_id");
      expect(item).toHaveProperty("ingredient_name");
      expect(item).toHaveProperty("makro_url");
      expect(item).toHaveProperty("used_in_dishes");
      expect(item.makro_url).toMatch(/^https:\/\/www\.makro\.pro\//);
      expect(Array.isArray(item.used_in_dishes)).toBe(true);
    }
  });

  it("total_items matches items array length", async () => {
    const { makroShoppingList } = await import("./makro-shopping-list.js");
    const result = await makroShoppingList();
    expect(result.total_items).toBe(result.items.length);
  });
});
