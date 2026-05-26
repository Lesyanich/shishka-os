/**
 * makro-pdf — Generate PDF shopping lists from Makro catalog data.
 *
 * Shared by makro_shopping_list and search_makro_catalog tools.
 * Uses pdfkit to produce landscape A4 tables with product photos,
 * barcodes, names, clickable links, and prices.
 */

import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface MakroPdfItem {
  title: string;
  barcode: string;
  brand: string;
  price: number | null;
  weight: string;
  image_url: string | null;
  product_url: string;
  stock?: number | string;
  category?: string;
}

/** Download image as Buffer, returns null on any failure. */
async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/** Column definition for the table. */
const COLS = [
  { label: "Photo", w: 55 },
  { label: "Barcode", w: 75 },
  { label: "Product Name", w: 210 },
  { label: "Brand", w: 65 },
  { label: "Weight", w: 50 },
  { label: "Stock", w: 42 },
  { label: "Link", w: 130 },
  { label: "Price (THB)", w: 60 },
] as const;

const TOTAL_W = COLS.reduce((s, c) => s + c.w, 0);
const ROW_H = 50;
const HEADER_H = 22;

export async function generateMakroPdf(
  items: MakroPdfItem[],
  title = "Makro Shopping List",
): Promise<string> {
  // Pre-download all images in parallel
  const imageBuffers = new Map<string, Buffer>();
  const urls = [...new Set(items.map((i) => i.image_url).filter(Boolean))] as string[];

  const downloads = await Promise.allSettled(
    urls.map(async (url) => {
      const buf = await fetchImage(url);
      if (buf && buf.length > 100) imageBuffers.set(url, buf);
    }),
  );

  const filePath = join(tmpdir(), `makro-shopping-${Date.now()}.pdf`);

  return new Promise<string>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 36, bottom: 28, left: 28, right: 28 },
      info: { Title: title, Author: "Shishka Chef Agent" },
    });

    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left + (pageW - TOTAL_W) / 2;

    // ── Title ──
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#1a1a2e")
      .text(title, { align: "center" });
    doc.moveDown(0.2);
    const dateStr = new Date().toISOString().split("T")[0];
    doc.fontSize(9).font("Helvetica").fillColor("#666666")
      .text(`Store: ST166 Rawai, Phuket  |  ${dateStr}  |  ${items.length} items`, { align: "center" });
    doc.moveDown(0.6);

    // ── Table ──
    let curY = doc.y;

    function drawHeader(y: number): number {
      doc.save();
      doc.rect(startX, y, TOTAL_W, HEADER_H).fill("#1a1a2e");
      let x = startX;
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#ffffff");
      for (const col of COLS) {
        doc.text(col.label, x + 3, y + 6, { width: col.w - 6, align: "center" });
        x += col.w;
      }
      doc.restore();
      doc.fillColor("#000000");
      // Red accent line under header
      doc.save();
      doc.moveTo(startX, y + HEADER_H).lineTo(startX + TOTAL_W, y + HEADER_H)
        .strokeColor("#e94560").lineWidth(1.5).stroke();
      doc.restore();
      return y + HEADER_H + 1;
    }

    curY = drawHeader(curY);

    // Category grouping
    let lastCategory = "";

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Category separator
      if (item.category && item.category !== lastCategory) {
        if (curY + 18 + ROW_H > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          curY = drawHeader(doc.page.margins.top);
        }
        doc.save();
        doc.rect(startX, curY, TOTAL_W, 18).fill("#f0f0f5");
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#e94560")
          .text(item.category, startX + 8, curY + 4, { width: TOTAL_W - 16 });
        doc.restore();
        curY += 18;
        lastCategory = item.category;
      }

      // New page check
      if (curY + ROW_H > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        curY = drawHeader(doc.page.margins.top);
      }

      // Alternating row background
      doc.save();
      if (i % 2 === 1) {
        doc.rect(startX, curY, TOTAL_W, ROW_H).fill("#f8f9fa");
      }
      // Row border
      doc.rect(startX, curY, TOTAL_W, ROW_H).strokeColor("#dee2e6").lineWidth(0.4).stroke();
      // Column separators
      let sepX = startX;
      for (const col of COLS) {
        sepX += col.w;
        if (sepX < startX + TOTAL_W) {
          doc.moveTo(sepX, curY).lineTo(sepX, curY + ROW_H)
            .strokeColor("#dee2e6").lineWidth(0.3).stroke();
        }
      }
      doc.restore();

      let x = startX;
      const textY = curY + 6;

      // Photo
      if (item.image_url && imageBuffers.has(item.image_url)) {
        try {
          const imgBuf = imageBuffers.get(item.image_url)!;
          doc.image(imgBuf, x + 4, curY + 2, { fit: [46, 46] });
        } catch {
          // skip broken image
        }
      }
      x += COLS[0].w;

      // Barcode
      doc.fontSize(8).font("Helvetica").fillColor("#000000");
      doc.text(item.barcode || "\u2014", x + 3, textY, { width: COLS[1].w - 6 });
      x += COLS[1].w;

      // Product Name
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000");
      doc.text(item.title, x + 3, textY, { width: COLS[2].w - 6, height: ROW_H - 12, ellipsis: true });
      x += COLS[2].w;

      // Brand
      doc.fontSize(8).font("Helvetica").fillColor("#333333");
      doc.text(item.brand || "\u2014", x + 3, textY, { width: COLS[3].w - 6 });
      x += COLS[3].w;

      // Weight
      doc.fontSize(8).fillColor("#000000");
      doc.text(item.weight || "\u2014", x + 3, textY, { width: COLS[4].w - 6, align: "center" });
      x += COLS[4].w;

      // Stock
      const stockStr = item.stock != null ? String(item.stock) : "\u2014";
      const stockColor = item.stock && Number(item.stock) > 0 ? "#16813d" : "#999999";
      doc.fontSize(8).fillColor(stockColor);
      doc.text(stockStr, x + 3, textY, { width: COLS[5].w - 6, align: "center" });
      x += COLS[5].w;

      // Link (clickable)
      doc.fontSize(6.5).fillColor("#0066cc");
      doc.text(item.product_url, x + 2, textY, {
        width: COLS[6].w - 4,
        height: ROW_H - 12,
        ellipsis: true,
        link: item.product_url,
        underline: true,
      });
      x += COLS[6].w;

      // Price
      const priceStr = item.price != null ? `\u0E3F${item.price.toLocaleString()}` : "\u2014";
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#16813d");
      doc.text(priceStr, x + 2, curY + 16, { width: COLS[7].w - 6, align: "right" });

      curY += ROW_H;
    }

    // ── Footer ──
    doc.fontSize(7).font("Helvetica").fillColor("#999999");
    doc.text(
      "Prices from makro.pro catalog (ST166 Rawai). Stock levels are approximate. Generated by Shishka Chef Agent.",
      startX, doc.page.height - doc.page.margins.bottom + 8,
      { width: TOTAL_W, align: "center" },
    );

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}
