// ═══════════════════════════════════════════════════════════
// Edge Function: parse-receipts
// Phase 4.17: Two-Stage OCR Pipeline
// Runtime: Deno (Supabase Edge Functions)
// ═══════════════════════════════════════════════════════════
// Stage 1: Google Cloud Vision (DOCUMENT_TEXT_DETECTION)
//   — 75MP limit (no 2048×2048 crush), Thai+English hints
//   — Accepts public imageUri (no download needed)
// Stage 2: OpenAI gpt-4o-mini (text → structured JSON)
//   — 15× cheaper than gpt-4o Vision, faster (~5-15s)
// ═══════════════════════════════════════════════════════════
// DUAL MODE:
//   Sync:  { image_urls: [...] } → returns ParsedReceipt (backward compat)
//   Async: { job_id: "uuid", image_urls: [...] } → writes to receipt_jobs,
//          returns { ok: true } immediately. Frontend listens via Realtime.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const GCV_API_KEY = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY")

// Supabase admin client — auto-injected env vars in Edge Functions
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// Phase 4.9: TypeScript safety net — strip footer items that leak through AI extraction
const FOOTER_RE = /^(total|subtotal|grand\s*total|net|net\s*total|vat|tax|discount|change|cash|card|credit|debit|points|member|bag\s*fee|rounding|round|ส่วนลด|ภาษี|ภาษีมูลค่าเพิ่ม|เงินทอน|เงินสด|รวม|ยอดรวม|ยอดสุทธิ|สุทธิ|บัตร|แต้ม|คูปอง|ทอน|เศษสตางค์)$/i

const VALID_UNITS = new Set(["kg", "L", "pcs"])
const VALID_CATEGORIES = new Set(["food", "capex", "opex", "uncategorized"])

// ── Phase 4.13b: Server-side schema validation ──
// deno-lint-ignore no-explicit-any
function validateReceiptSchema(parsed: any): { warnings: string[] } {
  const warnings: string[] = []

  if (typeof parsed.supplier_name !== "string") {
    parsed.supplier_name = String(parsed.supplier_name ?? "Unknown")
    warnings.push("supplier_name coerced to string")
  }
  if (parsed.invoice_number !== null && typeof parsed.invoice_number !== "string") {
    parsed.invoice_number = parsed.invoice_number ? String(parsed.invoice_number) : null
  }
  if (typeof parsed.total_amount !== "number") {
    parsed.total_amount = Number(parsed.total_amount) || 0
    warnings.push("total_amount coerced to number")
  }
  if (typeof parsed.currency !== "string") {
    parsed.currency = "THB"
  }
  if (typeof parsed.transaction_date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(parsed.transaction_date)) {
    warnings.push(`transaction_date invalid: "${parsed.transaction_date}"`)
  }

  if (!Array.isArray(parsed.line_items)) {
    parsed.line_items = []
    warnings.push("line_items was not an array — reset to []")
  }

  for (let i = 0; i < parsed.line_items.length; i++) {
    const li = parsed.line_items[i]
    if (typeof li.line_number !== "number") li.line_number = i + 1
    if (li.supplier_sku !== null && typeof li.supplier_sku !== "string") {
      li.supplier_sku = li.supplier_sku ? String(li.supplier_sku) : null
    }
    if (typeof li.original_name !== "string" || !li.original_name.trim()) {
      li.original_name = li.translated_name || `[ITEM ${i + 1}]`
      warnings.push(`line_items[${i}].original_name missing`)
    }
    if (typeof li.translated_name !== "string" || !li.translated_name.trim()) {
      li.translated_name = li.original_name || `[ITEM ${i + 1}]`
      warnings.push(`line_items[${i}].translated_name missing`)
    }
    if (typeof li.quantity !== "number") li.quantity = Number(li.quantity) || 1
    if (typeof li.unit_price !== "number") li.unit_price = Number(li.unit_price) || 0
    if (typeof li.total_price !== "number") li.total_price = Number(li.total_price) || 0
    if (!VALID_UNITS.has(li.unit)) {
      warnings.push(`line_items[${i}].unit "${li.unit}" → "pcs"`)
      li.unit = "pcs"
    }
    if (!VALID_CATEGORIES.has(li.category)) {
      warnings.push(`line_items[${i}].category "${li.category}" → "uncategorized"`)
      li.category = "uncategorized"
    }
  }

  if (!parsed.documents || typeof parsed.documents !== "object") {
    parsed.documents = { tax_invoice_index: null, supplier_receipt_index: null, bank_slip_index: null }
    warnings.push("documents object missing — defaulted")
  } else {
    for (const key of ["tax_invoice_index", "supplier_receipt_index", "bank_slip_index"]) {
      if (parsed.documents[key] !== null && typeof parsed.documents[key] !== "number") {
        parsed.documents[key] = null
      }
    }
  }

  return { warnings }
}

// ═══════════════════════════════════════════════════════════
// STAGE 1: Google Cloud Vision — DOCUMENT_TEXT_DETECTION
// ═══════════════════════════════════════════════════════════

async function callGoogleCloudVision(imageUrl: string): Promise<string> {
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${GCV_API_KEY}&fields=responses(fullTextAnnotation/text,error)`

  const requestBody = {
    requests: [
      {
        image: {
          source: { imageUri: imageUrl },
        },
        features: [
          { type: "DOCUMENT_TEXT_DETECTION" },
        ],
        imageContext: {
          languageHints: ["th", "en"],
        },
      },
    ],
  }

  console.log(`[GCV] Calling DOCUMENT_TEXT_DETECTION for: ${imageUrl.substring(0, 80)}...`)

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Google Cloud Vision API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const annotation = data.responses?.[0]

  if (annotation?.error) {
    throw new Error(`GCV error: ${annotation.error.message} (code ${annotation.error.code})`)
  }

  const fullText = annotation?.fullTextAnnotation?.text
  if (!fullText || fullText.trim().length === 0) {
    throw new Error("GCV returned empty text — image may be unreadable or corrupt")
  }

  console.log(`[GCV] Extracted ${fullText.length} chars from image`)
  return fullText
}

async function ocrAllImages(imageUrls: string[]): Promise<string> {
  const results: string[] = []

  for (let i = 0; i < imageUrls.length; i++) {
    const text = await callGoogleCloudVision(imageUrls[i])
    if (imageUrls.length > 1) {
      results.push(`=== IMAGE ${i + 1} OF ${imageUrls.length} ===\n${text}`)
    } else {
      results.push(text)
    }
  }

  return results.join("\n\n")
}

// ═══════════════════════════════════════════════════════════
// STAGE 2 PROMPT: Text-only structuring (no image references)
// All business rules preserved from Phase 4.13 SYSTEM_PROMPT
// ═══════════════════════════════════════════════════════════

const SYSTEM_PROMPT_TEXT = `You are a receipt digitizer for Shishka Healthy Kitchen (restaurant in Thailand).

## INPUT FORMAT
You will receive raw OCR text extracted from receipt images by Google Cloud Vision. The text is in reading order but may contain:
- Thai characters with occasional misreads (e.g., ก vs ค confusion, ้ vs ่ tone marks swapped)
- Merged words without spaces (Thai has no word delimiters)
- Numbers mixed into text lines
- Column alignment artifacts (spaces/tabs representing receipt columns)

YOUR #1 RULE: Extract ONLY real purchased products from the ITEM GRID zone. NEVER include receipt metadata (totals, taxes, discounts, change). NEVER invent products you cannot clearly identify in the OCR text.

## RECEIPT ANATOMY — 3 ZONES
Every receipt has exactly 3 zones. Identify them in the OCR text BEFORE extracting:

ZONE 1 — HEADER (metadata only):
  Store name, address, Tax ID, date, receipt number
  → Extract: supplier_name, transaction_date, invoice_number

ZONE 2 — ITEM GRID (extract products ONLY from here):
  Each line typically follows: [SKU] [Product Name Thai] [Qty] [Unit Price] [Total Price]
  Numbers at the end of a text line are usually qty, unit_price, total_price
  → Extract: each row as a line_item

ZONE 3 — FOOTER (total only):
  Starts at first line containing: รวม, ยอดรวม, Subtotal, Total, ส่วนลด, Discount, VAT, ภาษี, สุทธิ, Net
  Everything at and below = NOT products.
  → Extract: total_amount (final amount paid)

## BLACKLIST — NEVER add as line_items
Total, Subtotal, Grand Total, Net, VAT, Tax, Discount, Change, Cash, Card, Credit, Debit, Points, Member, Bag fee, Rounding,
รวม, ยอดรวม, ยอดสุทธิ, สุทธิ, ภาษี, ภาษีมูลค่าเพิ่ม, ส่วนลด, เงินสด, เงินทอน, ทอน, บัตร, แต้ม, คูปอง, เศษสตางค์

## OCR ARTIFACT HANDLING
The OCR text may have imperfections. Apply these rules:
1. If a Thai product name seems garbled, try to interpret it from context (surrounding items, prices, supplier type)
2. Numbers at the END of a line usually represent: quantity, unit_price, total_price (in that order, right-aligned)
3. A 6-13 digit number at the START of a product line is likely the supplier_sku (Makro item code)
4. Lines with ONLY numbers and no Thai text are usually subtotals or codes — skip them
5. If you see "=== IMAGE N OF M ===" markers, the text comes from multiple photos of the SAME receipt — combine into one unified list

## ANCHORING RULE (CRITICAL — prevents repetition loops)
For EACH item row, you MUST:
1. FIRST identify the EXACT Thai text from the OCR output → put into original_name
2. THEN translate that Thai text into English → put into translated_name
3. Each item's original_name MUST be UNIQUE — real receipts never have 2+ identical product names
4. If you notice you are writing the same original_name twice → STOP, re-read the OCR text carefully
5. If you cannot identify the text clearly → set translated_name to "[UNREADABLE]", do NOT copy a previous item

## MANDATORY SKU EXTRACTION
Makro items have a 6-13 digit item code. Extract into supplier_sku.
If no SKU found → set supplier_sku to null.

## TRANSLATION RULES (CEO cannot read Thai)
Translate Thai → English with MAXIMUM specificity:
- น้ำมันดอกทานตะวัน → "Sunflower oil" (NOT "Vegetable oil")
- น้ำมันรำข้าว → "Rice bran oil" (NOT "Vegetable oil")
- น้ำมันปาล์ม → "Palm oil" (NOT "Vegetable oil")
- น้ำมันมะกอก → "Olive oil" (NOT "Vegetable oil")
- น้ำมันพืช → "Vegetable oil" (only THIS one is generic)
- น้ำมันถั่วเหลือง → "Soybean oil" (NOT "Vegetable oil")
- หมูสับ → "Minced pork" (NOT "Pork")
- อกไก่ → "Chicken breast" (NOT "Chicken")
- กุ้งขาว → "White shrimp" (NOT "Shrimp")
- ไข่ไก่ → "Chicken eggs" (NOT "Eggs")
- ไข่เป็ด → "Duck eggs" (NOT "Eggs")
- แป้งข้าวเจ้า → "Rice flour" (NOT "Flour")
- แป้งสาลี → "Wheat flour" (NOT "Flour")
- น้ำตาลทราย → "Granulated sugar" (NOT "Sugar")
- น้ำตาลมะพร้าว → "Coconut sugar" (NOT "Sugar")
- เต้าหู้ → "Tofu"
- วุ้นเส้น → "Glass noodles"
- เส้นหมี่ → "Rice vermicelli"
- กะเพรา → "Holy basil" (NOT "Basil")
- โหระพา → "Sweet basil" (NOT "Basil")
- Keep translated_name CLEAN — no weight, quantity, or packaging info in the name
Do NOT transliterate Thai to Latin characters. TRANSLATE the meaning.
Brand names: describe the product (e.g., "Chicken eggs (ARO)").

## CATEGORY RULES — AUTO-DETECT FROM SUPPLIER
First, identify the supplier from the header:
- Makro, Lotus's, Big C, ตลาด (market), Fresh mart → default category = "food"
- HomePro, Thai Watsadu, Global House, Do Home → default category = "capex"
- Office Mate, B2S, 7-Eleven, convenience stores → default category = "opex"

Then override per-item using these rules:
- "food": raw ingredients, produce, proteins, grains, dairy, spices, sauces, oils, eggs, flour, sugar, noodles
- "capex": equipment, machinery, furniture, hardware — assets with life > 1 year
- "opex": cleaning, packaging, disposables, office supplies, plastic bags, delivery fees
- "uncategorized": items you cannot confidently classify

## UNIT NORMALIZATION (only 3 valid values)
- "kg" (g÷1000, กก.=kg, กรัม÷1000)
- "L" (ml÷1000, ลิตร=L, ซีซี÷1000)
- "pcs" (ชิ้น, อัน, ลูก, ขวด, กล่อง, ถุง, แพ็ค)
- "1 bag 500g" → quantity=0.5, unit="kg"

## OUTPUT SCHEMA
Return ONLY valid JSON with this structure:
{
  "supplier_name": "string",
  "invoice_number": "string or null",
  "total_amount": number,
  "currency": "THB",
  "transaction_date": "YYYY-MM-DD",
  "line_items": [
    {
      "line_number": 1,
      "supplier_sku": "string or null",
      "original_name": "exact Thai text from OCR",
      "translated_name": "English translation",
      "quantity": number,
      "unit": "kg" | "L" | "pcs",
      "unit_price": number,
      "total_price": number,
      "category": "food" | "capex" | "opex" | "uncategorized"
    }
  ],
  "documents": {
    "tax_invoice_index": number or null,
    "supplier_receipt_index": number or null,
    "bank_slip_index": number or null
  }
}

## DOCUMENT CLASSIFICATION (from OCR text clues)
- tax_invoice_index: text contains Tax ID (เลขประจำตัวผู้เสียภาษี), VAT breakdown
- supplier_receipt_index: POS receipt or itemized receipt
- bank_slip_index: bank transfer slip keywords (โอน, transfer)
- One document can be BOTH receipt AND tax invoice — set SAME index
- If a type is absent, set to null
- For multi-image input (=== IMAGE N OF M ===), use the image number (0-based) as the index

## MULTI-IMAGE RULES
- If you see "=== IMAGE 1 OF 2 ===" and "=== IMAGE 2 OF 2 ===", these are likely the SAME receipt (front/back or top/bottom). Combine all items into one list.
- Track items across image boundaries — the end of one image and start of the next may be the same receipt region.

transaction_date must come from the receipt text — NEVER use today's date.`

// ── Core parsing logic — Two-Stage Pipeline ──
// Stage 1: Google Cloud Vision OCR (image → text)
// Stage 2: OpenAI gpt-4o-mini (text → structured JSON)
// deno-lint-ignore no-explicit-any
async function parseReceiptImages(image_urls: string[]): Promise<{ parsed: any; ocrText: string }> {
  // ── STAGE 1: Google Cloud Vision OCR ──
  console.log(`[parse-receipts] STAGE 1: Sending ${image_urls.length} image(s) to Google Cloud Vision`)
  const ocrText = await ocrAllImages(image_urls)
  console.log(`[parse-receipts] STAGE 1 complete: ${ocrText.length} chars extracted`)

  // ── STAGE 2: OpenAI gpt-4o-mini text structuring ──
  console.log(`[parse-receipts] STAGE 2: Sending OCR text to gpt-4o-mini for structuring`)
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT_TEXT },
        {
          role: "user",
          content: `Digitize this receipt from OCR text. Identify the 3 zones (Header, Item Grid, Footer). For EACH product row: identify the Thai text (original_name), translate (translated_name). STOP at the Footer. Return structured JSON.\n\n--- OCR TEXT START ---\n${ocrText}\n--- OCR TEXT END ---`,
        },
      ],
      max_tokens: 16384,
      temperature: 0.2,
      frequency_penalty: 0.3,
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("No content in OpenAI response")

  const parsed = JSON.parse(content)

  // ── Pipeline metadata ──
  parsed._pipeline = {
    stage1: "google-cloud-vision",
    stage2: "gpt-4o-mini",
    ocr_chars: ocrText.length,
  }

  // Schema validation
  const { warnings } = validateReceiptSchema(parsed)
  if (warnings.length > 0) {
    console.warn(`[parse-receipts] Schema validation: ${warnings.join("; ")}`)
    parsed._schema_warnings = warnings
  }

  // Strip footer items
  const preFilterCount = parsed.line_items.length
  parsed.line_items = parsed.line_items.filter(
    (li: { translated_name?: string }) => {
      const name = (li.translated_name || "").trim()
      return name.length > 0 && !FOOTER_RE.test(name)
    },
  )
  const stripped = preFilterCount - parsed.line_items.length
  if (stripped > 0) {
    console.log(`[parse-receipts] FOOTER_RE stripped ${stripped} non-product items`)
  }

  // Repetition loop detection
  if (parsed.line_items.length > 3) {
    const nameCounts = new Map<string, number>()
    for (const li of parsed.line_items) {
      const name = (li.original_name || "").trim()
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
    }
    const maxCount = Math.max(...nameCounts.values(), 0)
    if (maxCount > parsed.line_items.length * 0.5) {
      console.warn(
        `[parse-receipts] REPETITION LOOP DETECTED: "${[...nameCounts.entries()].find(([, c]) => c === maxCount)?.[0]}" ` +
        `repeated ${maxCount}/${parsed.line_items.length} times. Deduplicating.`
      )
      const seen = new Set<string>()
      parsed.line_items = parsed.line_items.filter((li: { original_name?: string }) => {
        const name = (li.original_name || "").trim()
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
      parsed._repetition_loop = {
        detected: true,
        duplicates_removed: preFilterCount - stripped - parsed.line_items.length,
        warning: "AI model entered a repetition loop. Duplicates were removed. Please verify items manually.",
      }
    }
  }

  // Ensure documents
  parsed.documents = parsed.documents ?? {
    tax_invoice_index: null,
    supplier_receipt_index: null,
    bank_slip_index: null,
  }

  // Sum validation
  const lineSum = parsed.line_items.reduce(
    (s: number, item: { total_price?: number }) => s + (item.total_price || 0),
    0,
  )
  const declared = parsed.total_amount || 0
  if (Math.abs(lineSum - declared) > 1) {
    parsed._sum_mismatch = {
      line_items_sum: Math.round(lineSum * 100) / 100,
      declared_total: declared,
      difference: Math.round((declared - lineSum) * 100) / 100,
    }
  }

  // Backward compatibility: legacy 3-array format
  parsed.food_items = parsed.line_items
    .filter((li: { category?: string }) => li.category === "food")
    .map((li: { translated_name?: string; original_name?: string; supplier_sku?: string; quantity?: number; unit?: string; unit_price?: number; total_price?: number }) => ({
      name: li.translated_name || li.original_name || "",
      quantity: li.quantity || 0,
      unit: li.unit || "pcs",
      unit_price: li.unit_price || 0,
      total_price: li.total_price || 0,
      supplier_sku: li.supplier_sku || null,
      original_name: li.original_name || null,
    }))

  parsed.capex_items = parsed.line_items
    .filter((li: { category?: string }) => li.category === "capex")
    .map((li: { translated_name?: string; original_name?: string; quantity?: number; unit_price?: number; total_price?: number }) => ({
      name: li.translated_name || li.original_name || "",
      quantity: li.quantity || 0,
      unit_price: li.unit_price || 0,
      total_price: li.total_price || 0,
    }))

  parsed.opex_items = parsed.line_items
    .filter((li: { category?: string }) => li.category === "opex" || li.category === "uncategorized")
    .map((li: { translated_name?: string; original_name?: string; quantity?: number; unit?: string; unit_price?: number; total_price?: number }) => ({
      description: li.translated_name || li.original_name || "",
      quantity: li.quantity || 0,
      unit: li.unit || "pcs",
      unit_price: li.unit_price || 0,
      total_price: li.total_price || 0,
    }))

  console.log(
    `[parse-receipts] OK: ${parsed.supplier_name}, ` +
      `lines=${parsed.line_items.length}, ` +
      `food=${parsed.food_items.length}, capex=${parsed.capex_items.length}, ` +
      `opex=${parsed.opex_items.length}, ` +
      `sum=${lineSum}, declared=${declared}` +
      (parsed._repetition_loop ? ` 🔁 LOOP: ${parsed._repetition_loop.duplicates_removed} dupes removed` : "") +
      (parsed._sum_mismatch ? ` ⚠️ MISMATCH: ${parsed._sum_mismatch.difference}` : " ✅") +
      (warnings.length > 0 ? ` 🔧 SCHEMA: ${warnings.length} coercions` : ""),
  )

  return { parsed, ocrText }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    // Validate API keys
    if (!GCV_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_CLOUD_VISION_API_KEY not configured in Supabase Secrets" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in Supabase Secrets" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // Parse request body
    const body = await req.json()
    const { image_urls, job_id } = body

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "image_urls array is required and must not be empty" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // ── Phase 4.14: Lazy Cleanup — clean stale jobs on every invocation ──
    try {
      const { data: cleaned } = await supabaseAdmin.rpc("fn_cleanup_stale_receipt_jobs")
      if (cleaned && cleaned > 0) {
        console.log(`[parse-receipts] Lazy cleanup: ${cleaned} stale jobs marked as failed`)
      }
    } catch (cleanupErr) {
      // Non-fatal — don't block parsing if cleanup fails
      console.error("[parse-receipts] Lazy cleanup error (non-fatal):", cleanupErr)
    }

    // ── ASYNC MODE: job_id present → write results to receipt_jobs table ──
    if (job_id) {
      console.log(`[parse-receipts] ASYNC mode: job_id=${job_id}`)
      const startMs = Date.now()

      // Mark job as processing
      await supabaseAdmin
        .from("receipt_jobs")
        .update({ status: "processing" })
        .eq("id", job_id)

      try {
        const { parsed, ocrText } = await parseReceiptImages(image_urls)
        const durationMs = Date.now() - startMs

        // Write completed result to DB — Realtime will notify the frontend
        const { error: updateErr } = await supabaseAdmin
          .from("receipt_jobs")
          .update({
            status: "completed",
            result: parsed,
            model: "gcv+gpt-4o-mini",
            ocr_text: ocrText,
            completed_at: new Date().toISOString(),
            duration_ms: durationMs,
          })
          .eq("id", job_id)

        if (updateErr) {
          console.error(`[parse-receipts] ASYNC: failed to write result for job ${job_id}:`, updateErr)
        } else {
          console.log(`[parse-receipts] ASYNC: job ${job_id} completed in ${durationMs}ms (pipeline: GCV+gpt-4o-mini, OCR: ${ocrText.length} chars)`)
        }
      } catch (parseErr) {
        // ── BULLETPROOF: always write failure to DB ──
        const errorMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        console.error(`[parse-receipts] ASYNC: job ${job_id} failed:`, errorMsg)

        await supabaseAdmin
          .from("receipt_jobs")
          .update({
            status: "failed",
            error: errorMsg,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startMs,
          })
          .eq("id", job_id)
      }

      // Return immediately — frontend doesn't read this response
      return new Response(
        JSON.stringify({ ok: true, job_id }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // ── SYNC MODE: no job_id → return ParsedReceipt directly (backward compat) ──
    console.log("[parse-receipts] SYNC mode (legacy)")
    const { parsed } = await parseReceiptImages(image_urls)

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[parse-receipts] Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }
})
