import { describe, it, expect } from "vitest";
import { generateMakroPdf, type MakroPdfItem } from "./makro-pdf.js";
import { existsSync, unlinkSync, statSync } from "fs";

describe("generateMakroPdf", () => {
  const sampleItems: MakroPdfItem[] = [
    {
      title: "ARO Frozen Mango Namdokmai 1 kg",
      barcode: "8853478002104",
      brand: "ARO",
      price: 189,
      weight: "1 kg",
      image_url: null, // skip download in test
      product_url: "https://www.makro.pro/en/c/search?q=8853478002104",
      stock: 158,
      category: "Frozen Fruit",
    },
    {
      title: "SAVEPAK Frozen Strawberry 1 kg",
      barcode: "8851988001402",
      brand: "SAVEPAK",
      price: 65,
      weight: "1 kg",
      image_url: null,
      product_url: "https://www.makro.pro/en/c/search?q=8851988001402",
      stock: 528,
      category: "Frozen Fruit",
    },
  ];

  it("generates a valid PDF file", async () => {
    const pdfPath = await generateMakroPdf(sampleItems, "Test Shopping List");

    expect(pdfPath).toMatch(/\.pdf$/);
    expect(existsSync(pdfPath)).toBe(true);

    const stat = statSync(pdfPath);
    expect(stat.size).toBeGreaterThan(500); // non-trivial PDF

    // Cleanup
    unlinkSync(pdfPath);
  });

  it("handles empty items array", async () => {
    const pdfPath = await generateMakroPdf([], "Empty List");

    expect(existsSync(pdfPath)).toBe(true);
    const stat = statSync(pdfPath);
    expect(stat.size).toBeGreaterThan(100);

    unlinkSync(pdfPath);
  });

  it("handles items without optional fields", async () => {
    const minimal: MakroPdfItem[] = [
      {
        title: "Test Product",
        barcode: "",
        brand: "",
        price: null,
        weight: "",
        image_url: null,
        product_url: "https://www.makro.pro",
      },
    ];
    const pdfPath = await generateMakroPdf(minimal);

    expect(existsSync(pdfPath)).toBe(true);
    unlinkSync(pdfPath);
  });
});
