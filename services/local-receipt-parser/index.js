// ═══════════════════════════════════════════════════════════
// Local Receipt Parser — Ollama Edition
// Replaces GAS + Gemini cloud pipeline with local Ollama inference
// Model: gemma4:e4b via OpenAI-compatible API
// ═══════════════════════════════════════════════════════════
//
// Usage:
//   node index.js <image_path_or_url> [--job-id <uuid>] [--supabase]
//
// Modes:
//   1. Standalone: parse a local image file, print JSON to stdout
//   2. Supabase-integrated: read job from DB, parse, write result back
//
// Environment variables (for Supabase mode):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Ollama must be running at http://localhost:11434
// ═══════════════════════════════════════════════════════════

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

// ── Config ──
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e4b";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ── OpenAI-compatible client pointing at Ollama ──
const ollama = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama", // Ollama doesn't need a real key, but the SDK requires one
});

// ── MIME type detection ──
const MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "image/jpeg";
}

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT — adapted from ReceiptParser.gs
// Explicitly instructs the model to return valid JSON
// ═══════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are a receipt digitizer for Shishka Healthy Kitchen (restaurant in Thailand).
You MUST respond with ONLY valid JSON — no markdown, no code fences, no commentary.

YOUR #1 RULE: Extract ONLY real purchased products from the ITEM GRID zone. NEVER include receipt metadata (totals, taxes, discounts, change). NEVER invent products you cannot clearly read.

## RECEIPT ANATOMY — 3 ZONES
Every receipt has exactly 3 zones. Identify them BEFORE extracting:

ZONE 1 — HEADER (metadata only):
  Store name, address, Tax ID, date, receipt number
  → Extract: supplier_name, transaction_date, invoice_number

ZONE 2 — ITEM GRID (extract products ONLY from here):
  SKU | Product Name (Thai) | Qty | Unit Price | Total Price
  → Extract: each row as a line_item
  → Also extract brand (if visible) and package_weight (e.g. 500g, 1kg) per item

ZONE 3 — FOOTER (financial summary — extract as structured data):
  Starts at first line containing: รวม, ยอดรวม, Subtotal, Total, ส่วนลด, Discount, VAT, ภาษี, สุทธิ, Net
  Everything at and below = NOT products.
  → Extract into a "footer" object with these fields:
    - subtotal: sum before discounts
    - discount_total: total discount as NEGATIVE number. 0 if no discount.
    - vat_amount: VAT amount shown (informational only — Thai receipts use VAT-inclusive pricing)
    - delivery_fee: delivery/shipping charge (positive number). 0 if no delivery fee.
    - grand_total: final amount paid
  → Also set total_amount = grand_total
  → Formula: subtotal + discount_total + delivery_fee = grand_total (VAT is already INCLUDED in subtotal)

## BLACKLIST — NEVER add as line_items
Total, Subtotal, Grand Total, Net, VAT, Tax, Discount, Change, Cash, Card, Credit, Debit, Points, Member, Bag fee, Rounding, Delivery, Shipping,
รวม, ยอดรวม, ยอดสุทธิ, สุทธิ, ภาษี, ภาษีมูลค่าเพิ่ม, ส่วนลด, เงินสด, เงินทอน, ทอน, บัตร, แต้ม, คูปอง, เศษสตางค์, ค่าจัดส่ง, ค่าขนส่ง

## ANCHORING RULE (CRITICAL — prevents repetition loops)
For EACH item row, you MUST:
1. FIRST read the EXACT Thai text from the receipt image → put into original_name
2. THEN translate that Thai text into English → put into translated_name
3. Each item's original_name MUST be UNIQUE — real receipts never have 2+ identical product names
4. If you notice you are writing the same original_name twice → STOP, re-read the image carefully
5. If you cannot read the text clearly → set translated_name to "[UNREADABLE]", do NOT copy a previous item

## MANDATORY SKU EXTRACTION
Makro items have a 6-13 digit item code. Extract into supplier_sku.
If no SKU found → set supplier_sku to null.

## TRANSLATION RULES (CEO cannot read Thai)
Translate Thai → English with MAXIMUM specificity:
- น้ำมันดอกทานตะวัน → "Sunflower oil" (NOT "Vegetable oil")
- น้ำมันรำข้าว → "Rice bran oil" (NOT "Vegetable oil")
- หมูสับ → "Minced pork" (NOT "Pork")
- อกไก่ → "Chicken breast" (NOT "Chicken")
- CRITICAL: translated_name = ONLY the product name, nothing else.
  - NO weight (put in package_weight field)
  - NO brand (put in brand field)
  - NO packaging info
Brand names: put brand into the separate "brand" field, NOT into translated_name.

## COLUMN ALIGNMENT — CRITICAL for Makro receipts
Makro receipts have a strict table layout:
  QUANTITY/UN | ARTICLE (barcode) | ARTICLE DESCRIPTION (Thai) | PACKS | PRICE | DISC | ORDER PRICE
Rules:
- Each ARTICLE NUMBER (barcode) and its ARTICLE DESCRIPTION are on the SAME physical row
- PRICE column = unit price per item
- ORDER PRICE = final price for this line item. Use this as total_price.

## CATEGORY RULES — AUTO-DETECT FROM SUPPLIER
- Makro, Lotus's, Big C, market → default category = "food"
- HomePro, Thai Watsadu → default category = "capex"
- Office Mate, 7-Eleven → default category = "opex"
Override per-item: "food" (ingredients), "capex" (equipment >1yr), "opex" (cleaning/disposables), "uncategorized"

## UNIT NORMALIZATION (only 3 valid values)
- "kg" (g÷1000)
- "L" (ml÷1000)
- "pcs" (ชิ้น, อัน, ลูก, ขวด, กล่อง, ถุง, แพ็ค)

## OUTPUT SCHEMA — respond with EXACTLY this JSON structure:
{
  "supplier_name": "string",
  "invoice_number": "string or null",
  "total_amount": number,
  "currency": "THB",
  "transaction_date": "YYYY-MM-DD",
  "footer": {
    "subtotal": number,
    "discount_total": number,
    "vat_amount": number,
    "delivery_fee": 0,
    "grand_total": number
  },
  "item_count_observed": number,
  "line_items": [
    {
      "line_number": 1,
      "supplier_sku": "string or null",
      "original_name": "exact Thai text from receipt",
      "translated_name": "English translation",
      "quantity": number,
      "unit": "kg" | "L" | "pcs",
      "purchase_unit": "unit exactly as printed on receipt",
      "unit_price": number,
      "total_price": number,
      "category": "food" | "capex" | "opex" | "uncategorized",
      "confidence": "high" | "medium" | "low",
      "brand": "string or null",
      "package_weight": "string or null"
    }
  ],
  "documents": {
    "tax_invoice_index": null,
    "supplier_receipt_index": null,
    "bank_slip_index": null
  }
}

## ANTI-HALLUCINATION RULES
1. COUNT product rows visible in ITEM GRID → report as "item_count_observed". line_items length MUST match (±1).
2. CONFIDENCE SCORING: "high" (clear text), "medium" (some chars unclear), "low" (significant guessing).
3. If you cannot read >30% of an item's name → translated_name = "[UNREADABLE]", confidence = "low".
4. Thai grocery items typically cost 10-2000 THB per line. If >5000 THB, double-check.
5. If receipt is cut off, STOP extracting. Do not guess.
6. ZERO INVENTION RULE: translate ONLY words physically printed on the receipt.

## MULTI-IMAGE RULES
- If multiple images, they are likely the SAME receipt (front/back or consecutive pages). Combine into one list.
- Do NOT duplicate items in overlap zones.

transaction_date must come from the receipt — NEVER use today's date.

RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT.`;

// ── User message for the model ──
const USER_PROMPT = `This is a receipt image. Process it step-by-step:
1. Identify the 3 zones (Header, Item Grid, Footer)
2. For EACH product row: read the Thai text first (original_name), then translate (translated_name)
3. STOP at the Footer
4. Return structured JSON matching the schema exactly

IMPORTANT: Return ONLY valid JSON. No markdown code fences. No explanation text.`;

// ═══════════════════════════════════════════════════════════
// CORE: Parse receipt image via Ollama
// ═══════════════════════════════════════════════════════════
async function parseReceiptImage(imagePaths) {
  const imageContents = [];

  for (const imgPath of imagePaths) {
    let base64Data;
    let mimeType;

    if (imgPath.startsWith("http://") || imgPath.startsWith("https://")) {
      // Download from URL
      const response = await fetch(imgPath);
      if (!response.ok) throw new Error(`Failed to download image: ${response.status} ${imgPath}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      base64Data = buffer.toString("base64");
      mimeType = response.headers.get("content-type") || "image/jpeg";
    } else {
      // Read local file
      const filePath = resolve(imgPath);
      const buffer = await readFile(filePath);
      base64Data = buffer.toString("base64");
      mimeType = getMimeType(filePath);
    }

    imageContents.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64Data}`,
      },
    });
  }

  console.error(`[local-parser] Calling Ollama (${OLLAMA_MODEL}) with ${imageContents.length} image(s)...`);
  const startMs = Date.now();

  const response = await ollama.chat.completions.create({
    model: OLLAMA_MODEL,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          ...imageContents,
        ],
      },
    ],
    temperature: 0,
    max_tokens: 16384,
  });

  const durationMs = Date.now() - startMs;
  const rawText = response.choices?.[0]?.message?.content || "";

  console.error(`[local-parser] Ollama responded in ${durationMs}ms, ${rawText.length} chars`);

  // Extract JSON from response (handle possible markdown fences)
  let jsonText = rawText.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  try {
    const parsed = JSON.parse(jsonText);
    return { parsed, durationMs, model: OLLAMA_MODEL };
  } catch (parseErr) {
    console.error(`[local-parser] JSON parse error. Raw text (first 500):\n${rawText.substring(0, 500)}`);
    throw new Error(`Failed to parse Ollama response as JSON: ${parseErr.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// POST-PROCESSING — ported from ReceiptParser.gs
// ═══════════════════════════════════════════════════════════
const FOOTER_RE = /^(total|subtotal|grand\s*total|net|net\s*total|vat|tax|discount|change|cash|card|credit|debit|points|member|bag\s*fee|rounding|round|delivery|shipping|ค่าจัดส่ง|ค่าขนส่ง|ส่วนลด|ภาษี|ภาษีมูลค่าเพิ่ม|เงินทอน|เงินสด|รวม|ยอดรวม|ยอดสุทธิ|สุทธิ|บัตร|แต้ม|คูปอง|ทอน|เศษสตางค์)$/i;

const VALID_UNITS = new Set(["kg", "L", "pcs"]);
const VALID_CATEGORIES = new Set(["food", "capex", "opex", "uncategorized"]);

function sanitizeNumber(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[^\d.]/g, "");
  const parts = s.split(".");
  const clean = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : s;
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
}

function sanitizeSigned(val) {
  if (val == null || val === "") return 0;
  const neg = String(val).includes("-");
  const n = sanitizeNumber(val);
  return neg ? -Math.abs(n) : n;
}

function validateAndPostProcess(parsed) {
  const warnings = [];

  if (typeof parsed.supplier_name !== "string") {
    parsed.supplier_name = String(parsed.supplier_name || "Unknown");
    warnings.push("supplier_name coerced");
  }
  if (parsed.invoice_number !== null && typeof parsed.invoice_number !== "string") {
    parsed.invoice_number = parsed.invoice_number ? String(parsed.invoice_number) : null;
  }
  if (typeof parsed.total_amount !== "number") {
    parsed.total_amount = Number(parsed.total_amount) || 0;
    warnings.push("total_amount coerced");
  }
  if (typeof parsed.currency !== "string") {
    parsed.currency = "THB";
  }
  if (typeof parsed.transaction_date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(parsed.transaction_date)) {
    warnings.push("transaction_date invalid: " + parsed.transaction_date);
  }

  if (!Array.isArray(parsed.line_items)) {
    parsed.line_items = [];
    warnings.push("line_items was not an array");
  }

  for (let i = 0; i < parsed.line_items.length; i++) {
    const li = parsed.line_items[i];
    if (typeof li.line_number !== "number") li.line_number = i + 1;
    if (li.supplier_sku !== null && typeof li.supplier_sku !== "string") {
      li.supplier_sku = li.supplier_sku ? String(li.supplier_sku) : null;
    }
    if (typeof li.original_name !== "string" || !li.original_name.trim()) {
      li.original_name = li.translated_name || `[ITEM ${i + 1}]`;
      warnings.push(`line_items[${i}].original_name missing`);
    }
    if (typeof li.translated_name !== "string" || !li.translated_name.trim()) {
      li.translated_name = li.original_name || `[ITEM ${i + 1}]`;
      warnings.push(`line_items[${i}].translated_name missing`);
    }
    li.quantity = sanitizeNumber(li.quantity) || 1;
    li.unit_price = sanitizeNumber(li.unit_price);
    li.total_price = sanitizeNumber(li.total_price);
    li.discount = sanitizeSigned(li.discount);
    if (!VALID_UNITS.has(li.unit)) {
      warnings.push(`line_items[${i}].unit ${li.unit} → pcs`);
      li.unit = "pcs";
    }
    if (!VALID_CATEGORIES.has(li.category)) {
      warnings.push(`line_items[${i}].category ${li.category} → uncategorized`);
      li.category = "uncategorized";
    }
  }

  if (!parsed.documents || typeof parsed.documents !== "object") {
    parsed.documents = { tax_invoice_index: null, supplier_receipt_index: null, bank_slip_index: null };
    warnings.push("documents missing");
  }

  // Strip footer items that leaked into line_items
  const preFilterCount = parsed.line_items.length;
  parsed.line_items = parsed.line_items.filter((li) => {
    const name = (li.translated_name || "").trim();
    return name.length > 0 && !FOOTER_RE.test(name);
  });
  const stripped = preFilterCount - parsed.line_items.length;
  if (stripped > 0) {
    console.error(`[local-parser] Footer filter stripped ${stripped} non-product items`);
  }

  if (warnings.length > 0) {
    parsed._warnings = warnings;
    console.error(`[local-parser] Post-processing warnings: ${warnings.join(", ")}`);
  }

  return parsed;
}

// ═══════════════════════════════════════════════════════════
// SUPABASE MODE: Process a receipt_jobs entry
// ═══════════════════════════════════════════════════════════
async function processSupabaseJob(jobId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for Supabase mode");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Read job
  const { data: job, error: readErr } = await supabase
    .from("receipt_jobs")
    .select("image_urls, status")
    .eq("id", jobId)
    .single();

  if (readErr || !job) throw new Error(`Job ${jobId} not found: ${readErr?.message}`);
  if (!job.image_urls?.length) throw new Error(`Job ${jobId} has no image_urls`);

  console.error(`[local-parser] Job ${jobId}: ${job.image_urls.length} image(s), status was: ${job.status}`);

  // Mark as processing
  await supabase.from("receipt_jobs").update({ status: "processing" }).eq("id", jobId);

  try {
    const { parsed, durationMs, model } = await parseReceiptImage(job.image_urls);
    const processed = validateAndPostProcess(parsed);

    // Write result
    await supabase.from("receipt_jobs").update({
      status: "completed",
      result: processed,
      model: model,
      error: null,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    }).eq("id", jobId);

    console.error(`[local-parser] Job ${jobId} completed in ${durationMs}ms, ${processed.line_items.length} items`);
    return processed;
  } catch (err) {
    await supabase.from("receipt_jobs").update({
      status: "failed",
      error: err.message,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage:");
    console.error("  node index.js <image_path> [<image_path2>...]     — parse local image(s)");
    console.error("  node index.js --job-id <uuid>                     — process Supabase receipt_jobs entry");
    console.error("");
    console.error("Environment:");
    console.error("  OLLAMA_BASE_URL  (default: http://localhost:11434/v1)");
    console.error("  OLLAMA_MODEL     (default: gemma4:e4b)");
    console.error("  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (for --job-id mode)");
    process.exit(1);
  }

  const jobIdIdx = args.indexOf("--job-id");

  if (jobIdIdx !== -1) {
    // Supabase mode
    const jobId = args[jobIdIdx + 1];
    if (!jobId) {
      console.error("Error: --job-id requires a UUID argument");
      process.exit(1);
    }
    const result = await processSupabaseJob(jobId);
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Standalone mode — parse local image files
    const imagePaths = args.filter((a) => !a.startsWith("--"));
    if (imagePaths.length === 0) {
      console.error("Error: no image paths provided");
      process.exit(1);
    }

    const { parsed, durationMs, model } = await parseReceiptImage(imagePaths);
    const processed = validateAndPostProcess(parsed);

    console.log(JSON.stringify({
      ...processed,
      _meta: { model, duration_ms: durationMs, parser: "local-ollama" },
    }, null, 2));
  }
}

main().catch((err) => {
  console.error(`[local-parser] FATAL: ${err.message}`);
  process.exit(1);
});
