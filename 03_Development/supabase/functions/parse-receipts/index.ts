// ═══════════════════════════════════════════════════════════
// Edge Function: parse-receipts
// Phase 4.6: Perfect OCR & Smart Mapping Engine
// Runtime: Deno (Supabase Edge Functions)
// ═══════════════════════════════════════════════════════════
// Receives receipt image URLs → OpenAI gpt-4o-mini vision →
// Returns unified line_items[] with strict line-by-line OCR.
// Frontend reclassifies into food/capex/opex arrays.
// ═══════════════════════════════════════════════════════════

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `You are a STRICT line-by-line receipt OCR engine for Shishka Healthy Kitchen (restaurant, Thailand).
Your job is to extract EVERY SINGLE LINE ITEM from the receipt — no exceptions.

CRITICAL RULES:
1. Extract EVERY line item. NEVER skip, merge, summarize, or group items.
2. The sum of all line_items[].total_price MUST equal total_amount (within ±1 rounding).
3. If the sum does not match, you are MISSING lines. Go back and re-read the receipt.
4. If the receipt has discount lines, VAT lines, service charges, or rounding adjustments — include them as line items with negative or positive total_price as appropriate.
5. If you cannot classify a line item, set category to "uncategorized" — NEVER delete it.

Return ONLY valid JSON with this exact schema:
{
  "supplier_name": "string — vendor/store name (translated to English if Thai)",
  "invoice_number": "string or null — receipt/invoice number if visible",
  "total_amount": number,
  "currency": "THB" or "USD" or "EUR",
  "transaction_date": "YYYY-MM-DD — date STRICTLY from the receipt text, NEVER today's date",
  "line_items": [
    {
      "line_number": 1,
      "supplier_sku": "string or null — item code/barcode/SKU from receipt if visible",
      "original_name": "string — original text as printed on receipt (Thai, English, etc.)",
      "translated_name": "string — English translation (specific, never generalized)",
      "quantity": number,
      "unit": "kg|L|pcs",
      "unit_price": number,
      "total_price": number,
      "category": "food|capex|opex|uncategorized"
    }
  ],
  "documents": {
    "tax_invoice_index": "number or null — 0-based image index",
    "supplier_receipt_index": "number or null",
    "bank_slip_index": "number or null"
  }
}

Category classification:
- "food": raw ingredients, produce, proteins, grains, dairy, spices, sauces, oils — anything used IN food production
- "capex": equipment, machinery, furniture, IT hardware — assets with useful life > 1 year
- "opex": cleaning supplies, packaging, disposable containers, office supplies, services, delivery fees
- "uncategorized": anything you cannot confidently classify — NEVER delete uncertain items

SKU extraction:
- Many Thai suppliers (especially Makro, Lotus's, Big C) print item codes/barcodes next to each line
- If you see a numeric code (e.g. "8850999220000" or "SKU: 12345") next to an item, capture it in supplier_sku
- If no code is visible, set supplier_sku to null

Translation rules (CRITICAL — CEO does not read Thai):
- ALL names MUST be translated to English
- Do NOT transliterate — translate the meaning
- Be SPECIFIC — never generalize:
  - "น้ำมันดอกทานตะวัน" → "Sunflower oil" (NOT "Vegetable oil")
  - "น้ำมันรำข้าว" → "Rice bran oil" (NOT "Vegetable oil")
  - "น้ำมันมะกอก" → "Olive oil" (NOT "Vegetable oil")
  - "น้ำมันพืช" → "Vegetable oil" (this one IS generic — keep it)
  - "หมูสับ" → "Minced pork" (NOT just "Pork")
  - "อกไก่" → "Chicken breast" (NOT just "Chicken")
  - "กุ้งขาว" → "White shrimp" (NOT just "Shrimp")
- Keep translated_name CLEAN — no weight/quantity in the name (e.g. "Sunflower oil", NOT "Sunflower oil 1L")
- original_name must preserve the exact text from the receipt (Thai characters included)

Unit normalization (STRICT — only 3 valid values for unit):
- "kg" (convert: g÷1000, กก.=kg, กรัม÷1000)
- "L" (convert: ml÷1000, ลิตร=L, ซีซี÷1000)
- "pcs" (ชิ้น, อัน, ลูก, ขวด, กล่อง, ถุง — all become pcs with adjusted quantity)
- If receipt says "1 bag of 500g", quantity=0.5, unit="kg"
- If receipt says "2 boxes of 12 pcs", quantity=24, unit="pcs"
- NEVER output "kilograms", "liters", "pieces", "bags", "boxes" etc.

Document classification (0-based image indices):
- tax_invoice_index: image with tax ID, VAT breakdown, official format
- supplier_receipt_index: POS receipt or itemized supplier receipt
- bank_slip_index: bank transfer slip or payment proof
- Single image → classify it, set matching index to 0, others to null
- In Thailand, one document often serves as BOTH receipt AND tax invoice ("Receipt / Tax Invoice"). If so, set the SAME index for both supplier_receipt_index AND tax_invoice_index
- If a type is not present, set to null

FINAL CHECK before responding:
- Count your line_items and verify their total_price sum matches total_amount
- If there is a gap, you missed items — re-examine the receipt
- All monetary values must be numbers (not strings)
- Quantities must be positive numbers
- If multiple images are provided, they belong to the SAME transaction — combine into one response`

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    // Validate API key
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in Supabase Secrets" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // Parse request body
    const { image_urls } = await req.json()

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "image_urls array is required and must not be empty" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // Download images and convert to base64 (OpenAI can't reliably fetch
    // from Supabase Storage — timeouts are common). Base64 data URIs bypass
    // this entirely and are more reliable.
    const imageContent = await Promise.all(
      image_urls.map(async (url: string) => {
        try {
          const imgResp = await fetch(url)
          if (!imgResp.ok) throw new Error(`Failed to download ${url}: ${imgResp.status}`)
          const buf = await imgResp.arrayBuffer()
          const bytes = new Uint8Array(buf)
          // Manual base64 encode (Deno-compatible)
          let binary = ""
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          const b64 = btoa(binary)
          const contentType = imgResp.headers.get("content-type") || "image/jpeg"
          const dataUri = `data:${contentType};base64,${b64}`
          console.log(`[parse-receipts] Encoded ${url.split("/").pop()}: ${(b64.length / 1024).toFixed(0)}KB base64`)
          return {
            type: "image_url" as const,
            image_url: { url: dataUri, detail: "high" as const },
          }
        } catch (err) {
          console.error(`[parse-receipts] Image download failed: ${url}`, err)
          // Fallback to direct URL if download fails
          return {
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          }
        }
      }),
    )

    // Call OpenAI gpt-4o-mini vision
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse this receipt/invoice. Extract EVERY single line item. Return the structured JSON:",
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error("[parse-receipts] OpenAI API error:", response.status, errBody)
      return new Response(
        JSON.stringify({
          error: `OpenAI API error: ${response.status}`,
          details: errBody,
        }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    const data = await response.json()

    // Extract and parse the JSON content
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content in OpenAI response" }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    const parsed = JSON.parse(content)

    // Ensure line_items array exists
    parsed.line_items = parsed.line_items ?? []

    // Ensure documents object exists
    parsed.documents = parsed.documents ?? {
      tax_invoice_index: null,
      supplier_receipt_index: null,
      bank_slip_index: null,
    }

    // ── Sum validation: line_items total vs declared total ──
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

    // ── Backward compatibility: populate legacy 3-array format from line_items ──
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
        (parsed._sum_mismatch ? ` ⚠️ MISMATCH: ${parsed._sum_mismatch.difference}` : " ✅"),
    )

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
