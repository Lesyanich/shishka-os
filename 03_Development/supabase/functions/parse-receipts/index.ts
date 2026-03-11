// ═══════════════════════════════════════════════════════════
// Edge Function: parse-receipts
// Phase 4.4: AI Receipt Clustering & Smart Line-Item Routing
// Runtime: Deno (Supabase Edge Functions)
// ═══════════════════════════════════════════════════════════
// Receives receipt image URLs → OpenAI gpt-4o-mini vision →
// Returns structured JSON with supplier, items classified as
// food / capex / opex.
// ═══════════════════════════════════════════════════════════

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `You are a receipt/invoice parser for a restaurant kitchen supply chain (Shishka Healthy Kitchen, Thailand).
Analyze the provided receipt or invoice images and extract structured data.

Return ONLY valid JSON with this exact schema:
{
  "supplier_name": "string — the vendor / store name from the receipt",
  "invoice_number": "string or null — receipt or invoice number if visible",
  "total_amount": number,
  "currency": "THB" or "USD" or "EUR" etc.,
  "transaction_date": "YYYY-MM-DD — date from the receipt (STRICTLY from the document, never today's date)",
  "food_items": [
    { "name": "string", "quantity": number, "unit": "kg|L|pcs", "unit_price": number, "total_price": number }
  ],
  "capex_items": [
    { "name": "string", "quantity": number, "unit_price": number, "total_price": number }
  ],
  "opex_items": [
    { "description": "string", "quantity": number, "unit": "pcs|roll|bottle", "unit_price": number, "total_price": number }
  ],
  "documents": {
    "tax_invoice_index": number or null,
    "supplier_receipt_index": number or null,
    "bank_slip_index": number or null
  }
}

Item classification rules:
- food_items: raw ingredients, produce, proteins, grains, dairy, spices, sauces, oils — anything that goes INTO food production
- capex_items: equipment, machinery, furniture, construction materials, IT hardware, appliances — assets with useful life > 1 year
- opex_items: cleaning supplies, packaging materials, disposable containers, office supplies, services, delivery fees — consumables used up quickly

Unit normalization (CRITICAL for BOM integrity):
- Always normalize food_items unit to standard metric: kg, L, or pcs
- If receipt says "1 bag of 500g", extract quantity as 0.5 and unit as "kg"
- If receipt says "2 boxes of 12 pcs", extract quantity as 24 and unit as "pcs"
- Convert grams to kg (divide by 1000), milliliters to L (divide by 1000)
- NEVER use bag, box, pack, bundle, can, bottle as food_items unit — always convert to kg, L, or pcs

Document classification (0-based image indices):
- tax_invoice_index: image that is a tax invoice (has tax ID number, VAT breakdown, official government format)
- supplier_receipt_index: image that is a supplier receipt or POS receipt (itemized list from store/supplier)
- bank_slip_index: image that is a bank transfer slip or payment proof
- If only one image, classify it and set the matching index to 0, others to null
- IMPORTANT: In Thailand, a single document often serves as BOTH receipt and tax invoice (printed "Receipt / Tax Invoice"). If so, set the SAME image index for both supplier_receipt_index AND tax_invoice_index
- If a document type is not present, set its index to null

Language (CRITICAL — CEO does not read Thai):
- ALL item names, descriptions, and supplier_name MUST be translated to English
- Thai text on receipts must be translated, not transliterated
- Example: "พริกหวาน" → "Sweet pepper" (NOT "Phrik Wan")
- Example: "น้ำมันพืช" → "Vegetable oil" (NOT "Nam Man Phuet")
- Example: "มะเขือเทศเชอร์รี่" → "Cherry tomato"
- Keep the name CLEAN — do NOT include weight/quantity in the name field (e.g. "Sweet pepper", NOT "Sweet pepper 100g")

Unit values (STRICT — only these 3 strings are valid for food_items.unit):
- "kg" (not "kilograms", not "kgs", not "กก", not "กก.")
- "L" (not "liters", not "litres", not "liter", not "ลิตร")
- "pcs" (not "pieces", not "piece", not "ชิ้น")

If a category has no items, return an empty array [].
If you cannot determine a field, use null.
All monetary values must be numbers (not strings).
Quantities must be positive numbers.
If multiple receipt images are provided, they belong to the SAME transaction — combine all items into a single response.`

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
                text: "Parse this receipt/invoice and return the structured JSON:",
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 3000,
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

    // Ensure arrays and objects exist (defensive)
    parsed.food_items = parsed.food_items ?? []
    parsed.capex_items = parsed.capex_items ?? []
    parsed.opex_items = parsed.opex_items ?? []
    parsed.documents = parsed.documents ?? {
      tax_invoice_index: null,
      supplier_receipt_index: null,
      bank_slip_index: null,
    }

    console.log(
      `[parse-receipts] OK: ${parsed.supplier_name}, ` +
        `food=${parsed.food_items.length}, capex=${parsed.capex_items.length}, ` +
        `opex=${parsed.opex_items.length}, ` +
        `docs: tax=${parsed.documents.tax_invoice_index}, ` +
        `supplier=${parsed.documents.supplier_receipt_index}, ` +
        `bank=${parsed.documents.bank_slip_index}`,
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
