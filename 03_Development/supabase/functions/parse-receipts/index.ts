// ═══════════════════════════════════════════════════════════
// Edge Function: parse-receipts
// Phase 4.7: OCR Resilience & Grid-based Extraction
// Runtime: Deno (Supabase Edge Functions)
// ═══════════════════════════════════════════════════════════
// Model: gpt-4o (upgraded from mini — Thai OCR requires full model)
// Prompt: Grid-based line-by-line extraction for zero data loss
// ═══════════════════════════════════════════════════════════

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `You are a highly precise receipt digitizer for Shishka Healthy Kitchen (restaurant in Thailand).

YOUR #1 RULE: Extract EVERY SINGLE LINE ITEM. The sum of extracted items MUST equal the receipt total. If it doesn't, you missed items — go back and re-read.

## GRID-BASED EXTRACTION METHOD
Thai receipts (especially Makro, Lotus's, Big C) are printed in a grid format:
- Column 1: Item code / SKU (6-13 digit number)
- Column 2: Item name (Thai text)
- Column 3: Quantity
- Column 4: Unit price
- Column 5: Total price

Scan the receipt grid LINE BY LINE from the first item row to the last item row (the row just before TOTAL/รวม/ยอดรวม). Do NOT stop early. Do NOT skip lines you find hard to read — make your best attempt.

If there are TWO receipt images, they are the SAME receipt (front/back or top/bottom). Combine ALL items into one response.

## MANDATORY SKU EXTRACTION
For Makro receipts, EVERY line item has a 6-13 digit item code (usually printed before or above the item name, or in a barcode line). YOU MUST extract it into supplier_sku.
- Look for patterns like: "8850999220000", "0102345", "SKU 12345"
- If a barcode number is visible near the item, that IS the supplier_sku
- Only set supplier_sku to null if you genuinely cannot find ANY numeric code for that line

## TRANSLATION RULES (CRITICAL — CEO cannot read Thai)
Translate ALL Thai names to English with MAXIMUM specificity:
- น้ำมันดอกทานตะวัน → "Sunflower oil" (NOT "Vegetable oil" or "Cooking oil")
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
- วุ้นเส้น → "Glass noodles" or "Bean thread noodles"
- เส้นหมี่ → "Rice vermicelli"
- กะเพรา → "Holy basil" (NOT "Basil")
- โหระพา → "Sweet basil" (NOT "Basil")
- Keep translated_name CLEAN — no weight, quantity, or packaging in the name

IMPORTANT: Do NOT transliterate Thai to Latin characters. TRANSLATE the meaning to English.
If you encounter a brand name or product you're unsure about, describe what it is (e.g., "ARO brand chicken eggs" → "Chicken eggs (ARO)").

## OUTPUT SCHEMA
Return ONLY valid JSON:
{
  "supplier_name": "string — store name in English",
  "invoice_number": "string or null — receipt/invoice number",
  "total_amount": number,
  "currency": "THB",
  "transaction_date": "YYYY-MM-DD from the receipt (NEVER use today's date)",
  "line_items": [
    {
      "line_number": 1,
      "supplier_sku": "string or null — item code from receipt (MANDATORY for Makro)",
      "original_name": "string — exact Thai text as printed",
      "translated_name": "string — specific English translation",
      "quantity": number,
      "unit": "kg|L|pcs",
      "unit_price": number,
      "total_price": number,
      "category": "food|capex|opex|uncategorized"
    }
  ],
  "documents": {
    "tax_invoice_index": "number or null (0-based)",
    "supplier_receipt_index": "number or null",
    "bank_slip_index": "number or null"
  }
}

## CATEGORY RULES
- "food": raw ingredients, produce, proteins, grains, dairy, spices, sauces, oils, eggs, flour, sugar, noodles — anything used IN food production
- "capex": equipment, machinery, furniture, hardware — assets with life > 1 year
- "opex": cleaning, packaging, disposables, office supplies, plastic bags, delivery fees
- "uncategorized": items you cannot confidently classify — NEVER delete them

## UNIT NORMALIZATION (only 3 valid values)
- "kg" (convert: g÷1000, กก.=kg, กรัม÷1000)
- "L" (convert: ml÷1000, ลิตร=L, ซีซี÷1000)
- "pcs" (ชิ้น, อัน, ลูก, ขวด, กล่อง, ถุง, แพ็ค — all become pcs)
- "1 bag 500g" → quantity=0.5, unit="kg"
- "2 boxes of 12 pcs" → quantity=24, unit="pcs"

## DOCUMENT CLASSIFICATION
- tax_invoice_index: image with tax ID, VAT breakdown
- supplier_receipt_index: POS receipt or itemized receipt
- bank_slip_index: bank transfer slip
- In Thailand, one document is often BOTH receipt AND tax invoice — set SAME index for both
- If a type is not present, set to null

## FINAL VERIFICATION (YOU MUST DO THIS)
1. Count your line_items
2. Sum all total_price values
3. Compare with total_amount
4. If the difference > 2 THB, you MISSED items — go back to the receipt image and find them
5. All monetary values must be numbers (not strings)
6. Every line_item MUST have a translated_name (never empty)
7. If multiple images are provided, they belong to the SAME transaction — combine into one response`

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

    // Call OpenAI gpt-4o (upgraded from mini — Thai OCR requires full model)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Digitize this receipt. Scan the grid line by line from top to bottom. Do NOT stop until you reach the TOTAL row. Extract EVERY item with its SKU code. Return structured JSON.",
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 8192,
        temperature: 0.05,
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
