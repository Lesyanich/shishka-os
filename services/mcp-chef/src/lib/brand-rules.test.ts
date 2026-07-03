import { describe, it, expect } from "vitest";
import { checkBrandCompliance } from "./brand-rules.js";

describe("checkBrandCompliance", () => {
  describe("banned RBD seed/grain oils (hard block)", () => {
    it("bans rice bran oil by code", () => {
      const r = checkBrandCompliance("RAW-RICE_BRAN_OIL", "Rice Bran Oil");
      expect(r.status).toBe("banned");
      if (r.status === "banned") expect(r.matched).toBe("rice bran oil");
    });

    it("bans canola/rapeseed", () => {
      expect(checkBrandCompliance("RAW-CANOLA_OIL", "Canola Oil").status).toBe("banned");
      expect(checkBrandCompliance("RAW-RAPESEED_OIL", "Rapeseed Oil").status).toBe("banned");
    });

    it("bans soybean, sunflower, corn oils", () => {
      expect(checkBrandCompliance("RAW-SOYBEAN_OIL", "Soybean Oil").status).toBe("banned");
      expect(checkBrandCompliance("RAW-SUNFLOWER_OIL", "Sunflower Oil").status).toBe("banned");
      expect(checkBrandCompliance("RAW-CORN_OIL", "Corn Oil").status).toBe("banned");
    });

    it("bans generic vegetable oil and MSG", () => {
      expect(checkBrandCompliance("RAW-VEGETABLE_OIL", "Vegetable Oil").status).toBe("banned");
      expect(checkBrandCompliance("RAW-MSG", "Monosodium Glutamate").status).toBe("banned");
    });

    it("matches on name even if code is neutral", () => {
      const r = checkBrandCompliance("RAW-MYSTERY_FAT", "cheap sunflower oil blend");
      expect(r.status).toBe("banned");
    });
  });

  describe("approved fats (must NOT be flagged)", () => {
    it("allows EVOO, avocado, coconut (incl. deodorized)", () => {
      expect(checkBrandCompliance("RAW-OLIVE_OIL_EV", "Extra Virgin Olive Oil").status).toBe("ok");
      expect(checkBrandCompliance("RAW-AVOCADO_OIL", "Refined Avocado Oil").status).toBe("ok");
      expect(checkBrandCompliance("RAW-COCONUT_OIL", "Virgin Coconut Oil").status).toBe("ok");
      expect(checkBrandCompliance("RAW-COCONUT_OIL_DEO", "Deodorized Coconut Oil").status).toBe("ok");
    });
  });

  describe("gated animal fats (soft confirmation)", () => {
    it("gates ghee, duck fat, lard, tallow", () => {
      expect(checkBrandCompliance("RAW-GHEE", "Ghee").status).toBe("gated");
      expect(checkBrandCompliance("RAW-DUCK_FAT", "Duck Fat").status).toBe("gated");
      expect(checkBrandCompliance("RAW-LARD", "Lard").status).toBe("gated");
      expect(checkBrandCompliance("RAW-BEEF_TALLOW", "Beef Tallow").status).toBe("gated");
    });

    it("gates dairy butter", () => {
      expect(checkBrandCompliance("RAW-BUTTER", "Butter").status).toBe("gated");
    });

    it("does NOT gate nut/plant butters", () => {
      expect(checkBrandCompliance("RAW-PEANUT_BUTTER", "Peanut Butter").status).toBe("ok");
      expect(checkBrandCompliance("RAW-ALMOND_BUTTER", "Almond Butter").status).toBe("ok");
      expect(checkBrandCompliance("RAW-CASHEW_BUTTER", "Cashew Butter").status).toBe("ok");
      expect(checkBrandCompliance("RAW-COCOA_BUTTER", "Cocoa Butter").status).toBe("ok");
    });
  });

  describe("neutral ingredients", () => {
    it("passes ordinary produce", () => {
      expect(checkBrandCompliance("RAW-ROMAINE_LETTUCE", "Romaine Lettuce").status).toBe("ok");
      expect(checkBrandCompliance("RAW-CHICKEN_BREAST", "Chicken Breast").status).toBe("ok");
      expect(checkBrandCompliance("", "").status).toBe("ok");
    });
  });
});
