#!/usr/bin/env node
// ════���═══════════════════════════��══════════════════════════
// Finance Agent — Ollama Edition (WF-1: Receipt Parsing)
// Replaces Claude Sonnet agent with local Gemma 4 via Ollama
//
// Model: gemma4:e2b (OpenAI-compatible API)
// Cost: $0 per receipt (local inference)
//
// Usage:
//   node agents/finance/ollama-agent.js                # process next pending receipt
//   node agents/finance/ollama-agent.js --batch        # process all pending receipts
//   node agents/finance/ollama-agent.js --id <uuid>    # process specific inbox item
//
// Environment:
//   SUPABASE_URL              — required
//   SUPABASE_SERVICE_ROLE_KEY — required
//   OLLAMA_BASE_URL           — default: http://localhost:11434/v1
//   OLLAMA_MODEL              — default: gemma4:e2b
// ═══════════════════════════════════════════════════════════

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ── Config ──
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STORAGE_BUCKET = "receipts";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

// ── Clients ──
const ollama = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama", // Ollama doesn't require a real key, but OpenAI SDK demands one
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ════���══════════════════════════════════════════════════════
// SYSTEM PROMPT — strict JSON output for Gemma 4
// Adapted from AGENT-FAST.md + local-receipt-parser
// ═════════════════════��═════════════════════════════════════
const SYSTEM_PROMPT = `You are a receipt digitizer for Shishka Healthy Kitchen (restaurant in Phuket, Thailand).
You MUST respond with ONLY valid JSON — no markdown, no code fences, no commentary, no explanation.

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
  → Also set amount_original = grand_total
  → Formula: subtotal + discount_total + delivery_fee = grand_total (VAT is already INCLUDED in subtotal)

## SUPPLIER TYPE DETECTION
| Pattern on receipt | supplier_type |
|--------------------|---------------|
| "SIAM MAKRO", "แม็คโคร", 6-digit articles | makro |
| "Big C", "Lotus's", "เซ็นทรัล" | bigc |
| Handwritten, thermal printer, no articles | market-small |
| "Grab", "LINE MAN", electronic receipt | delivery |
| "TAX INVOICE", "ใบกำกับภาษี" | tax-invoice (modifier — add to main type) |

## MAKRO-SPECIFIC RULES
- Two lines per item: Thai on top, English below = ONE item
- Column layout: QUANTITY/UN | ARTICLE (barcode) | DESCRIPTION | PACKS | PRICE | DISC | ORDER PRICE
- ARTICLE = supplier_sku (6-digit), Barcode = barcode (8-13 digit)
- ORDER PRICE = total_price for the line item
- MEM.DISC / MBR DISC → discount_total (negative)
- Date format: DD/MM/BBBB (Buddhist Era — subtract 543 for Gregorian year)

## MARKET-SMALL RULES
- No barcode, no supplier_sku (set null)
- Weight items: "Pork 2.5 kg × 180" → qty: 2.5, unit: "kg"
- No VAT: vat_amount = 0

## DELIVERY RULES
- Delivery Fee → delivery_fee (NOT a line item)
- Supplier = restaurant/store name, NOT "Grab"

## TAX INVOICE (modifier)
- If "TAX INVOICE" present → set has_tax_invoice: true in raw_parse
- If absent → add _tax_reminder: "Request tax invoice next time"

## BLACKLIST — NEVER add as line_items
Total, Subtotal, Grand Total, Net, VAT, Tax, Discount, Change, Cash, Card, Credit, Debit, Points, Member, Bag fee, Rounding, Delivery, Shipping,
รวม, ยอดรวม, ยอดสุทธิ, ส���ทธิ, ภาษี, ภาษีมูลค่าเพิ่ม, ส่วนลด, เงินสด, เงินทอน, ทอน, บัตร, แต้ม, คูปอง, เศษสตางค์, ค่าจัดส่ง, ค่าขนส่ง

## ANCHORING RULE (prevents hallucination loops)
1. Read EXACT Thai text → original_name
2. Translate to English → translated_name
3. Each original_name MUST be UNIQUE — real receipts never repeat product names
4. If writing same name twice → STOP, re-read the image
5. If unreadable → translated_name: "[UNREADABLE]", confidence: "low"

## TRANSLATION RULES (CEO cannot read Thai)
Translate Thai → English with MAXIMUM specificity:
- น้ำมันดอกทานตะวัน → "Sunflower oil" (NOT "Vegetable oil")
- หมูสับ → "Minced pork" (NOT "Pork")
- อกไก่ → "Chicken breast" (NOT "Chicken")
- Brand names → separate "brand" field, NOT in translated_name
- Weight/size → separate "package_weight" field

## UNIT NORMALIZATION (only 3 valid values)
- "kg" (g÷1000), "L" (ml÷1000), "pcs" (ชิ้น, อัน, ลูก, ขวด, กล่อง, ถุง, แพ็ค)

## CLASSIFICATION
| Type | flow_type | category_code |
|------|-----------|---------------|
| Kitchen food | COGS | 4100 |
| Beverages (alcohol) | COGS | 4200 |
| Packaging | COGS | 4300 |
| Cleaning, household | OpEx | 2100 |
| Small tools (<2000 THB) | OpEx | 2100 |
| Equipment (>2000 THB) | CapEx | 1100 |
| Repairs | CapEx | 1200 |

Mixed receipt: food → food_items[], cleaning → opex_items[], equipment → capex_items[].

## ARITHMETIC VERIFICATION (MANDATORY before output)
1. Each line: qty × unit_price = total_price (±1 THB)
2. SUM(all total_price) ≈ subtotal
3. subtotal + discount_total + delivery_fee = amount_original
4. If math doesn't match → re-read the image. NEVER output incorrect math.

## OUTPUT SCHEMA — respond with EXACTLY this JSON:
{
  "supplier_name": "string (English)",
  "supplier_type": "makro|bigc|market-small|delivery",
  "invoice_number": "string or null",
  "amount_original": number,
  "currency": "THB",
  "transaction_date": "YYYY-MM-DD",
  "payment_method": "cash|transfer|card|other",
  "flow_type": "COGS|OpEx|CapEx|Mixed",
  "category_code": number,
  "has_tax_invoice": boolean,
  "footer": {
    "subtotal": number,
    "discount_total": number,
    "vat_amount": number,
    "delivery_fee": number,
    "grand_total": number
  },
  "item_count_observed": number,
  "food_items": [
    {
      "line_number": 1,
      "barcode": "string or null",
      "supplier_sku": "string or null",
      "original_name": "exact Thai text",
      "translated_name": "English translation",
      "brand": "string or null",
      "package_weight": "string or null",
      "quantity": number,
      "unit": "kg|L|pcs",
      "purchase_unit": "unit as printed",
      "unit_price": number,
      "total_price": number,
      "category": "food",
      "confidence": "high|medium|low"
    }
  ],
  "opex_items": [],
  "capex_items": [],
  "raw_parse": {
    "store_address": "string or null",
    "tax_id": "string or null",
    "cashier": "string or null",
    "tax_invoice": null
  },
  "documents": {
    "tax_invoice_index": null,
    "supplier_receipt_index": null,
    "bank_slip_index": null
  }
}

## ANTI-HALLUCINATION RULES
1. COUNT product rows visible in ITEM GRID → report as item_count_observed. Total items length MUST match (±1).
2. CONFIDENCE: "high" (clear), "medium" (some chars unclear), "low" (guessing).
3. If >30% unreadable → translated_name: "[UNREADABLE]", confidence: "low".
4. Thai grocery items typically 10-2000 THB per line. If >5000, double-check.
5. ZERO INVENTION: translate ONLY words physically printed on the receipt.
6. transaction_date MUST come from the receipt — NEVER use today's date. Buddhist Era: year − 543.

RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT.`;

const USER_PROMPT = `This is a receipt image. Process it step-by-step:
1. Identify the 3 zones (Header, Item Grid, Footer)
2. Detect supplier type (makro, market-small, delivery, etc.)
3. For EACH product row: read Thai text (original_name), translate (translated_name)
4. Extract footer totals
5. Classify flow_type and category_code
6. Verify arithmetic
7. Return structured JSON matching the schema exactly

IMPORTANT: Return ONLY valid JSON. No markdown fences. No explanation.`;

// ═══════════════════════════════════════════════════════════
// POST-PROCESSING — validation & sanitization
// ═════════════════���═════════════════════════════════════════
const FOOTER_WORDS_RE = /^(total|subtotal|grand\s*total|net|vat|tax|discount|change|cash|card|credit|debit|points|member|bag\s*fee|rounding|delivery|shipping|ค่าจัดส่ง|ค่าขนส่ง|ส่วนลด|ภาษี|ภาษีมูลค่าเพิ่ม|เงินทอน|เงินสด|รวม|ย��ดรวม|ยอดสุทธ���|สุทธิ|บัต���|แต้ม|คูปอง|ทอน|เศษสตางค์)$/i;

function sanitizeNumber(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[^\d.]/g, "");
  const parts = s.split(".");
  const clean = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : s;
  return Number(clean) || 0;
}

function sanitizeSigned(val) {
  if (val == null || val === "") return 0;
  const neg = String(val).includes("-");
  const n = sanitizeNumber(val);
  return neg ? -Math.abs(n) : n;
}

const VALID_UNITS = new Set(["kg", "L", "pcs"]);
const VALID_CATEGORIES = new Set(["food", "capex", "opex", "uncategorized"]);

function validateAndPostProcess(parsed) {
  const warnings = [];

  // Coerce top-level fields
  if (typeof parsed.supplier_name !== "string") {
    parsed.supplier_name = String(parsed.supplier_name || "Unknown");
    warnings.push("supplier_name coerced");
  }
  parsed.amount_original = sanitizeNumber(parsed.amount_original);
  parsed.currency = parsed.currency || "THB";

  if (!/^\d{4}-\d{2}-\d{2}/.test(parsed.transaction_date || "")) {
    warnings.push("transaction_date invalid: " + parsed.transaction_date);
  }

  // Ensure item arrays exist
  for (const key of ["food_items", "opex_items", "capex_items"]) {
    if (!Array.isArray(parsed[key])) parsed[key] = [];
  }

  // Validate each item array
  const allItems = [
    ...parsed.food_items.map((i, idx) => ({ item: i, idx, source: "food_items" })),
    ...parsed.opex_items.map((i, idx) => ({ item: i, idx, source: "opex_items" })),
    ...parsed.capex_items.map((i, idx) => ({ item: i, idx, source: "capex_items" })),
  ];

  for (const { item: li, idx, source } of allItems) {
    if (typeof li.line_number !== "number") li.line_number = idx + 1;
    li.quantity = sanitizeNumber(li.quantity) || 1;
    li.unit_price = sanitizeNumber(li.unit_price);
    li.total_price = sanitizeNumber(li.total_price);
    if (!VALID_UNITS.has(li.unit)) {
      warnings.push(`${source}[${idx}].unit "${li.unit}" → pcs`);
      li.unit = "pcs";
    }
    if (!VALID_CATEGORIES.has(li.category)) {
      li.category = source === "food_items" ? "food" : source === "capex_items" ? "capex" : "opex";
    }
    if (!li.original_name || typeof li.original_name !== "string") {
      li.original_name = li.translated_name || `[ITEM ${idx + 1}]`;
      warnings.push(`${source}[${idx}].original_name missing`);
    }
    if (!li.translated_name || typeof li.translated_name !== "string") {
      li.translated_name = li.original_name || `[ITEM ${idx + 1}]`;
    }
  }

  // Strip footer leaks
  for (const key of ["food_items", "opex_items", "capex_items"]) {
    const before = parsed[key].length;
    parsed[key] = parsed[key].filter(
      (li) => !FOOTER_WORDS_RE.test((li.translated_name || "").trim())
    );
    const stripped = before - parsed[key].length;
    if (stripped > 0) warnings.push(`${key}: stripped ${stripped} footer items`);
  }

  // Ensure footer
  if (!parsed.footer || typeof parsed.footer !== "object") {
    parsed.footer = { subtotal: 0, discount_total: 0, vat_amount: 0, delivery_fee: 0, grand_total: parsed.amount_original };
    warnings.push("footer missing, reconstructed");
  }
  parsed.footer.discount_total = sanitizeSigned(parsed.footer.discount_total);

  // Ensure documents
  if (!parsed.documents) {
    parsed.documents = { tax_invoice_index: null, supplier_receipt_index: null, bank_slip_index: null };
  }

  if (warnings.length > 0) {
    parsed._warnings = warnings;
    log(`Post-processing warnings: ${warnings.join(", ")}`);
  }

  return parsed;
}

// ═══════════════════════════════════════════════════════════
// SUPABASE OPERATIONS (replaces MCP tool calls)
// ���══════════════════════════════════════════════════════════

async function checkInbox(status = "pending", limit = 1) {
  const { data, error } = await supabase
    .from("receipt_inbox")
    .select("*")
    .eq("status", status)
    .order("upload_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`check_inbox failed: ${error.message}`);
  return data || [];
}

async function updateInboxStatus(inboxId, status, extra = {}) {
  const update = { status, ...extra };
  if (status === "parsed" || status === "processed") {
    update.processed_at = new Date().toISOString();
  }
  if (extra.parsed_payload) {
    update.parsed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("receipt_inbox")
    .update(update)
    .eq("id", inboxId)
    .select("id, status")
    .single();

  if (error) throw new Error(`update_inbox failed: ${error.message}`);
  return data;
}

async function downloadReceiptImage(storagePath) {
  // Normalize path
  let path = storagePath;
  const urlMatch = path.match(/\/storage\/v1\/object\/public\/receipts\/(.+)$/);
  if (urlMatch) path = urlMatch[1];
  else if (path.startsWith("receipts/")) path = path.slice("receipts/".length);

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error) throw new Error(`download failed for ${path}: ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const contentType = data.type || "image/jpeg";
  return { base64: buffer.toString("base64"), contentType };
}

async function checkDuplicate(date, supplierName, amount) {
  let q = supabase
    .from("expense_ledger")
    .select("id, transaction_date, amount_original, details, status")
    .eq("transaction_date", date);

  if (amount) q = q.eq("amount_original", amount);

  const { data, error } = await q;
  if (error) return { is_duplicate: false };

  let matches = data || [];
  if (supplierName) {
    const lower = supplierName.toLowerCase();
    matches = matches.filter((r) => r.details?.toLowerCase().includes(lower));
  }

  return {
    is_duplicate: matches.length > 0,
    matches: matches.map((r) => ({ id: r.id, date: r.transaction_date, amount: r.amount_original })),
  };
}

async function emitBusinessTask(taskData) {
  const { error } = await supabase.from("business_tasks").insert({
    title: taskData.title,
    domain: taskData.domain || "finance",
    status: taskData.status || "done",
    priority: taskData.priority || "medium",
    source: "agent_discovery",
    created_by: "finance-agent-ollama",
    tags: taskData.tags || ["receipt"],
    related_ids: taskData.related_ids || {},
    assigned_to: null,
  });
  if (error) log(`Warning: MC task creation failed: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════
// CORE: Call Ollama for receipt parsing
// ��══════════════════════════════════════════════════════════

async function parseWithOllama(base64Image, contentType) {
  log(`Calling Ollama (${OLLAMA_MODEL})...`);
  const startMs = Date.now();

  const response = await ollama.chat.completions.create({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${contentType};base64,${base64Image}` },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 16384,
  });

  const durationMs = Date.now() - startMs;
  const rawText = response.choices?.[0]?.message?.content || "";
  log(`Ollama responded in ${durationMs}ms (${rawText.length} chars)`);

  // Extract JSON — handle possible markdown fences from less disciplined output
  let jsonText = rawText.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  const parsed = JSON.parse(jsonText);
  return { parsed, durationMs };
}

// ═══════════════════════════════════════════════════════════
// WF-1: Full receipt processing pipeline
// ═══════════════════════════════════════════════════════════

async function processReceipt(inboxItem) {
  const { id: inboxId, photo_urls, supplier_hint, amount_hint } = inboxItem;
  log(`Processing inbox ${inboxId} (${photo_urls?.length || 0} photo(s))`);

  // Step 1: Lock
  await updateInboxStatus(inboxId, "processing");

  try {
    // Step 2: Download first photo
    const photoPath = photo_urls?.[0];
    if (!photoPath) throw new Error("No photo_urls in inbox item");

    const { base64, contentType } = await downloadReceiptImage(photoPath);
    log(`Downloaded ${Math.round(base64.length / 1024)}KB image`);

    // Step 3: Parse with Ollama
    const { parsed, durationMs } = await parseWithOllama(base64, contentType);
    const validated = validateAndPostProcess(parsed);

    // Inject hints if model couldn't determine
    if (supplier_hint && (!validated.supplier_name || validated.supplier_name === "Unknown")) {
      validated.supplier_name = supplier_hint;
    }

    // Step 4: Check duplicate
    const dupCheck = await checkDuplicate(
      validated.transaction_date,
      validated.supplier_name,
      validated.amount_original
    );
    if (dupCheck.is_duplicate) {
      validated._duplicate_warning = true;
      validated._duplicate_matches = dupCheck.matches;
      log(`⚠ Duplicate detected! ${dupCheck.matches.length} match(es)`);
    }

    // Step 5: Save parsed payload
    await updateInboxStatus(inboxId, "parsed", { parsed_payload: validated });

    // Step 6: Emit MC task
    const totalItems =
      (validated.food_items?.length || 0) +
      (validated.opex_items?.length || 0) +
      (validated.capex_items?.length || 0);

    await emitBusinessTask({
      title: `Parsed receipt: ${validated.supplier_name} | ${validated.amount_original} THB | ${totalItems} items`,
      domain: "finance",
      status: dupCheck.is_duplicate ? "inbox" : "done",
      priority: dupCheck.is_duplicate ? "high" : "medium",
      tags: ["receipt", validated.supplier_type || "unknown", "ollama"],
      related_ids: { inbox_id: inboxId, receipt_date: validated.transaction_date },
    });

    log(`✅ Done: ${validated.supplier_name} | ${validated.amount_original} THB | ${totalItems} items (${durationMs}ms)`);
    return validated;
  } catch (err) {
    log(`✗ Error: ${err.message}`);
    await updateInboxStatus(inboxId, "error", { error_message: err.message });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ���═══════��══════════════════════════════════════════════════

function log(msg) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  console.error(`[${ts}] ${msg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const isBatch = args.includes("--batch");
  const idIdx = args.indexOf("--id");
  const specificId = idIdx !== -1 ? args[idIdx + 1] : null;

  log(`Finance Agent (Ollama/${OLLAMA_MODEL}) starting...`);

  if (specificId) {
    // Process specific inbox item
    const { data, error } = await supabase
      .from("receipt_inbox")
      .select("*")
      .eq("id", specificId)
      .single();
    if (error || !data) {
      log(`Inbox item ${specificId} not found`);
      process.exit(1);
    }
    const result = await processReceipt(data);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check pending items
  let items = await checkInbox("pending", isBatch ? 50 : 1);

  // Also check stuck "processing" items (from crashed previous runs)
  if (items.length === 0) {
    items = await checkInbox("processing", 1);
    if (items.length > 0) log(`Found ${items.length} stuck "processing" item(s), recovering...`);
  }

  if (items.length === 0) {
    log("No receipts in queue. Done.");
    return;
  }

  log(`${items.length} receipt(s) to process`);

  let success = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await processReceipt(item);
      success++;
    } catch {
      failed++;
    }

    if (!isBatch) break; // single mode: process one and stop
  }

  log(`Session complete: ${success} parsed, ${failed} failed, ${items.length - success - failed} skipped`);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
