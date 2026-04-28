import { describe, it, expect } from "vitest";
import type { UpdateEquipmentArgs } from "./update-equipment.js";

describe("updateEquipment", () => {
  it("requires equipment_id", async () => {
    const { updateEquipment } = await import("./update-equipment.js");
    const result = await updateEquipment({ equipment_id: "" } as UpdateEquipmentArgs);
    expect(result).toHaveProperty("ok", false);
  });

  it("rejects empty update", async () => {
    const { updateEquipment } = await import("./update-equipment.js");
    const result = await updateEquipment({ equipment_id: "00000000-0000-0000-0000-000000000000" });
    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error", "No fields to update");
  });
});
